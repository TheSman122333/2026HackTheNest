import {
  ACTIVITY_KINDS,
  DEFAULT_LIMITS,
  EMPTY_STREAK,
  SKILLS,
  clampLimits,
  dayKeyInTz,
} from '@last-voyage/game';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import { AVATAR_IDS, type Collections, type UserDoc } from './db';
import { awardActivity, reconcileActivityReceipts } from './activities';
import { createIsland, registerIsland, resumeVoyage } from './island';
import { ledger, spendMoves, todayMoves } from './moves';
import { registerLegend } from './legend';
import { registerMusic } from './music';
import { registerOpening } from './opening';
import { registerQuests } from './quests';
import { registerSoundtrack } from './soundtrack';
import { registerShip, shipWindMultiplier } from './ship';
import { exchangeSsojetCode, SsojetAuthenticationError, SsojetRequestError, SsojetUnavailableError } from './ssojet';

type Env = { Variables: { user: UserDoc } };

export type AppDeps = {
  c: Collections;
  jwtSecret: string;
  allowDevLogin: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  now?: () => Date;
};

export function createApp({ c, jwtSecret, allowDevLogin, env = process.env, fetchImpl = fetch, now }: AppDeps) {
  const key = new TextEncoder().encode(jwtSecret);
  const app = new Hono<Env>();
  app.use('*', cors());
  // Verbose request log in dev (method, path, status, time). Off in tests.
  if (env.NODE_ENV !== 'test') app.use('*', logger());

  const body = async <T extends z.ZodType>(ctx: Context, schema: T): Promise<z.infer<T>> => {
    const parsed = schema.safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    return parsed.data;
  };

  const sign = (userId: ObjectId) =>
    new SignJWT({}).setProtectedHeader({ alg: 'HS256' }).setSubject(userId.toHexString()).setExpirationTime('30d').sign(key);

  const defaultUser = (name: string, tz: string): UserDoc => ({
    _id: new ObjectId(),
    name,
    tz,
    crewId: null,
    skills: Object.fromEntries(SKILLS.map((s) => [s, 10])) as UserDoc['skills'],
    supplies: 0,
    legend: 0,
    streak: EMPTY_STREAK,
    limits: DEFAULT_LIMITS,
    createdAt: new Date(),
  });

  const publicUser = (u: UserDoc) => ({
    id: u._id.toHexString(),
    name: u.name,
    avatarId: u.avatarId ?? null,
    preferences: u.preferences ?? null,
    tz: u.tz,
    crewId: u.crewId?.toHexString() ?? null,
    skills: u.skills,
    supplies: u.supplies,
    legend: u.legend,
    limits: u.limits,
  });

  app.get('/health', (ctx) => ctx.json({ ok: true }));

  // ---------- auth ----------
  /**
   * SSOJet only accepts http(s) callback URLs, so it redirects the phone's browser here and we
   * bounce the code/state into the app's deep link. Only these three params are forwarded.
   */
  app.get('/auth/ssojet/callback', (ctx) => {
    const out = new URLSearchParams();
    for (const k of ['code', 'state', 'error'] as const) {
      const v = ctx.req.query(k);
      if (v && v.length <= 4096) out.set(k, v);
    }
    const target = `lastvoyage://auth/callback?${out.toString()}`;
    const safe = target.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    return ctx.html(
      `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1">` +
        `<meta http-equiv="refresh" content="0;url=${safe}"><title>The Last Voyage</title></head>` +
        `<body style="background:#27187E;color:#F1F2F6;font-family:sans-serif;text-align:center;padding:48px 16px">` +
        `<h2>Boarding…</h2><p><a href="${safe}" style="display:inline-block;background:#FF8600;color:#140C4F;` +
        `padding:14px 22px;border-radius:14px;font-weight:800;text-decoration:none;border:3px solid #140C4F">Return to The Last Voyage</a></p>` +
        `<script>location.replace(${JSON.stringify(target)})</script></body></html>`,
    );
  });

  app.post('/auth/ssojet', async (ctx) => {
    const parsed = z
      .object({
        authorizationCode: z.string().min(1).max(4096),
        codeVerifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        redirectUri: z.string().url(),
        tz: z.string().default('UTC').refine((value) => {
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        }, 'tz must be a valid IANA timezone'),
      })
      .strict()
      .safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

    let identity: { sub: string; name: string | null };
    try {
      identity = await exchangeSsojetCode(
        parsed.data,
        env,
        fetchImpl,
      );
    } catch (error) {
      if (error instanceof SsojetAuthenticationError) throw new HTTPException(401, { message: error.message });
      if (error instanceof SsojetRequestError) throw new HTTPException(400, { message: error.message });
      if (error instanceof SsojetUnavailableError) throw new HTTPException(503, { message: error.message });
      throw new HTTPException(502, { message: 'SSOJet sign-in could not be completed' });
    }

    let user = await c.users.findOne({ ssojetSub: identity.sub });
    if (!user) {
      const created = defaultUser(identity.name ?? 'Sailor', parsed.data.tz);
      created.ssojetSub = identity.sub;
      try {
        await c.users.insertOne(created);
        user = created;
      } catch (error) {
        if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
        user = await c.users.findOne({ ssojetSub: identity.sub });
        if (!user) throw error;
      }
    } else if (user.name === 'Sailor' && identity.name) {
      // Accounts made before names were read from SSOJet get their real name now.
      await c.users.updateOne({ _id: user._id }, { $set: { name: identity.name } });
    }

    const resumed = await resumeVoyage(c, user);
    const freshUser = (await c.users.findOne({ _id: user._id })) ?? user;
    return ctx.json({
      token: await sign(freshUser._id),
      user: publicUser(freshUser),
      ...resumed,
      nextStep: resumed.crew ? 'ship' : 'crew_setup',
    });
  });

  // Dev login: name → user + JWT.
  app.post('/auth/dev', async (ctx) => {
    if (!allowDevLogin) throw new HTTPException(403, { message: 'dev login disabled' });
    const { name, tz } = await body(ctx, z.object({ name: z.string().trim().min(1).max(32), tz: z.string().default('UTC') }));
    const user = defaultUser(name, tz);
    await c.users.insertOne(user);
    return ctx.json({ token: await sign(user._id), user: publicUser(user) });
  });

  app.use('/me/*', auth);
  app.use('/me', auth);
  app.use('/crews/*', auth);
  app.use('/crews', auth);
  app.use('/activities', auth);
  app.use('/quests', auth);
  app.use('/quests/*', auth);
  app.use('/moves/*', auth);
  app.use('/log', auth);
  app.use('/crew', auth);
  app.use('/crew/*', auth);
  app.use('/legend', auth);
  app.use('/legend/*', auth);
  app.use('/island', auth);
  app.use('/island/*', auth);
  app.use('/voice/*', auth);
  app.use('/audio/*', auth);

  async function auth(ctx: Context<Env>, next: () => Promise<void>) {
    const h = ctx.req.header('authorization') ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    try {
      const { payload } = await jwtVerify(token, key);
      const user = await c.users.findOne({ _id: new ObjectId(payload.sub) });
      if (!user) throw new Error('no user');
      const platform = ctx.req.header('x-lv-platform');
      if ((platform === 'android' || platform === 'ios' || platform === 'web') && user.platform !== platform) {
        await c.users.updateOne({ _id: user._id }, { $set: { platform } });
        user.platform = platform;
      }
      ctx.set('user', user);
    } catch {
      throw new HTTPException(401, { message: 'unauthorized' });
    }
    await next();
  }

  // ---------- me ----------
  app.get('/me', async (ctx) => {
    const user = ctx.get('user');
    await reconcileActivityReceipts(c, user);
    const [crew, today] = await Promise.all([
      user.crewId ? c.crews.findOne({ _id: user.crewId }) : null,
      todayMoves(c, user),
    ]);
    return ctx.json({ user: publicUser(user), crew: crew && publicCrew(crew), today });
  });

  /** Change your display name (crewmates and the leaderboard see it). */
  app.put('/me/name', async (ctx) => {
    const user = ctx.get('user');
    const { name } = await body(ctx, z.object({ name: z.string().transform((s) => s.trim().replace(/\s+/g, ' ')).pipe(z.string().min(1).max(32)) }));
    await c.users.updateOne({ _id: user._id }, { $set: { name } });
    return ctx.json({ user: publicUser({ ...user, name }) });
  });

  app.put('/me/limits', async (ctx) => {
    const user = ctx.get('user');
    const limits = clampLimits(await body(ctx, z.object({ swipes: z.number(), minutes: z.number() })));
    await c.users.updateOne({ _id: user._id }, { $set: { limits } });
    return ctx.json({ limits });
  });

  app.put('/me/avatar', async (ctx) => {
    const user = ctx.get('user');
    // This route accepts an outfit ID only; images and local photo paths are never uploaded.
    const { avatarId } = await body(ctx, z.object({ avatarId: z.enum(AVATAR_IDS) }).strict());
    await c.users.updateOne({ _id: user._id }, { $set: { avatarId } });
    return ctx.json({ avatarId });
  });

  // ---------- crews ----------
  const publicCrew = (cr: { _id: ObjectId; name: string; inviteCode: string; memberIds: ObjectId[]; stores: Record<string, number> }) => ({
    id: cr._id.toHexString(),
    name: cr.name,
    inviteCode: cr.inviteCode,
    memberIds: cr.memberIds.map((m) => m.toHexString()),
    stores: cr.stores,
  });

  app.post('/crews', async (ctx) => {
    const user = ctx.get('user');
    if (user.crewId) throw new HTTPException(409, { message: 'already in a crew' });
    const { name } = await body(ctx, z.object({ name: z.string().trim().min(1).max(40) }));
    const crew = {
      _id: new ObjectId(),
      name,
      inviteCode: inviteCode(),
      memberIds: [user._id],
      stores: { supplies: 0 },
      createdAt: new Date(),
    };
    await c.crews.insertOne(crew);
    await createIsland(c, crew._id, 0);
    await c.users.updateOne({ _id: user._id }, { $set: { crewId: crew._id } });
    return ctx.json({ crew: publicCrew(crew) });
  });

  app.post('/crews/join', async (ctx) => {
    const user = ctx.get('user');
    if (user.crewId) throw new HTTPException(409, { message: 'already in a crew' });
    const { code } = await body(ctx, z.object({ code: z.string().trim().toUpperCase() }));
    const crew = await c.crews.findOneAndUpdate(
      { inviteCode: code },
      { $addToSet: { memberIds: user._id } },
      { returnDocument: 'after' },
    );
    if (!crew) throw new HTTPException(404, { message: 'no crew with that code' });
    await c.users.updateOne({ _id: user._id }, { $set: { crewId: crew._id } });
    return ctx.json({ crew: publicCrew(crew) });
  });

  /**
   * Leave your crew to join another. Typing the crew's name confirms it (case and spacing
   * don't matter). Nothing is lost: you keep Legend, skills and your pirate; the crew keeps
   * its stores, island and log, and you can rejoin later with the invite code.
   */
  app.post('/crew/leave', async (ctx) => {
    const user = ctx.get('user');
    if (!user.crewId) throw new HTTPException(409, { message: 'not in a crew' });
    const { confirmName } = await body(ctx, z.object({ confirmName: z.string().max(80) }));
    const crew = await c.crews.findOne({ _id: user.crewId });
    const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
    if (crew && norm(confirmName) !== norm(crew.name)) {
      throw new HTTPException(400, { message: `type the crew name "${crew.name}" to leave` });
    }
    await c.users.updateOne({ _id: user._id, crewId: user.crewId }, { $set: { crewId: null } });
    if (crew) {
      await c.crews.updateOne({ _id: crew._id }, { $pull: { memberIds: user._id } });
      await ledger(c, { crewId: crew._id, userId: user._id, item: 'crew', delta: -1, reason: 'crew:leave', text: `${user.name} left the crew to sail with another. Fair winds!` });
    }
    return ctx.json({ left: true });
  });

  // ---------- real-life fuel ----------
  app.post('/activities', async (ctx) => {
    const user = ctx.get('user');
    const { kind } = await body(ctx, z.object({ kind: z.enum(ACTIVITY_KINDS) }));
    return ctx.json(await awardActivity(c, user, kind, now?.() ?? new Date()));
  });

  /** The app pushes today's device numbers (steps + scroll aggregates). Only totals, never raw data. */
  app.put('/moves/today', async (ctx) => {
    const user = ctx.get('user');
    const input = await body(
      ctx,
      z.object({
        steps: z.number().int().min(0).max(200_000),
        screen: z.object({
          swipes: z.number().int().min(0),
          minutes: z.number().min(0),
          opens: z.number().int().min(0),
          tracked: z.boolean(),
        }),
      }),
    );
    const now = new Date();
    const day = dayKeyInTz(now, user.tz);
    await c.dayLogs.updateOne(
      { userId: user._id, day },
      { $set: { steps: input.steps, screen: input.screen, updatedAt: now }, $setOnInsert: { movesSpent: 0 } },
      { upsert: true },
    );
    return ctx.json({ today: await todayMoves(c, user, now) });
  });

  /**
   * iPhone/web can't read step counters, so players type in today's steps from their Health
   * app (honor system, worth up to 6 Moves). Android counts steps automatically instead.
   */
  app.put('/moves/steps', async (ctx) => {
    const user = ctx.get('user');
    if (user.platform === 'android') throw new HTTPException(409, { message: 'Steps are counted automatically on Android.' });
    const { steps } = await body(ctx, z.object({ steps: z.number().int().min(0).max(100_000) }));
    const now = new Date();
    const day = dayKeyInTz(now, user.tz);
    await c.dayLogs.updateOne(
      { userId: user._id, day },
      { $set: { steps, updatedAt: now }, $setOnInsert: { movesSpent: 0, screen: { swipes: 0, minutes: 0, opens: 0, tracked: false } } },
      { upsert: true },
    );
    return ctx.json({ today: await todayMoves(c, user, now) });
  });

  /** Island board spends Moves. Atomic: fails if not enough left. */
  app.post('/moves/spend', async (ctx) => {
    const user = ctx.get('user');
    const { n } = await body(ctx, z.object({ n: z.number().int().min(1).max(50) }));
    try {
      await spendMoves(c, user, n);
    } catch {
      throw new HTTPException(409, { message: 'not enough moves' });
    }
    return ctx.json({ today: await todayMoves(c, user) });
  });

  // ---------- log (audit feed) ----------
  app.get('/log', async (ctx) => {
    const user = ctx.get('user');
    const filter = user.crewId ? { $or: [{ crewId: user.crewId }, { userId: user._id }] } : { userId: user._id };
    const entries = await c.ledger.find(filter).sort({ at: -1 }).limit(100).toArray();
    return ctx.json({
      entries: entries.map((e) => ({
        id: e._id!.toHexString(),
        text: e.text ?? `${e.delta > 0 ? '+' : ''}${e.delta} ${e.item} (${e.reason})`,
        item: e.item,
        delta: e.delta,
        reason: e.reason,
        at: e.at,
      })),
    });
  });

  // ---------- crew roster ----------
  app.get('/crew', async (ctx) => {
    const user = ctx.get('user');
    if (!user.crewId) return ctx.json({ crew: null, members: [], sailing: null });
    const crew = await c.crews.findOne({ _id: user.crewId });
    const members = await c.users.find({ crewId: user.crewId }).toArray();
    // Each sailor contributes their own local day. Spending Moves never slows the ship.
    const now = new Date();
    const days = await Promise.all(members.map((member) => todayMoves(c, member, now)));
    const totalMoves = days.reduce((total, day) => total + day.moves.total, 0);
    return ctx.json({
      crew: crew && publicCrew(crew),
      members: members.map((m, i) => ({ id: m._id.toHexString(), name: m.name, avatarId: m.avatarId ?? null, legend: m.legend, skills: m.skills, calmDays: days[i]!.streak.calmDays })),
      sailing: {
        totalMoves,
        averageMoves: members.length ? totalMoves / members.length * shipWindMultiplier(crew) : 0,
        activities: days.reduce((total, day) => total + day.activities.length, 0),
        steps: days.reduce((total, day) => total + day.steps, 0),
        activeMembers: days.filter((day) => day.steps > 0 || day.activities.length > 0).length,
        members: members.length,
      },
    });
  });

  registerIsland(app, c, { env, fetchImpl });
  registerMusic(app, c, { env, fetchImpl });
  registerOpening(app, c, { env, fetchImpl });
  registerShip(app, c);
  registerLegend(app, c);
  registerQuests(app, c, { env, fetchImpl, now });
  registerSoundtrack(app, c, { env, fetchImpl });

  app.onError((err, ctx) => {
    if (err instanceof HTTPException) return ctx.json({ error: err.message }, err.status);
    if (err instanceof z.ZodError) return ctx.json({ error: err.message }, 400);
    console.error(err);
    return ctx.json({ error: 'internal' }, 500);
  });

  return app;
}

function inviteCode(): string {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => A[Math.floor(Math.random() * A.length)]).join('');
}
