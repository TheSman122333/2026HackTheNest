import {
  ACTIVITY_KINDS,
  DEFAULT_LIMITS,
  EMPTY_STREAK,
  SKILLS,
  clampLimits,
  dayKeyInTz,
  grantForActivity,
  type ActivityLog,
} from '@last-voyage/game';
import { Hono, type Context } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import { SignJWT, jwtVerify } from 'jose';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import type { Collections, UserDoc } from './db';
import { createIsland, registerIsland, resumeVoyage } from './island';
import { ledger, spendMoves, todayMoves } from './moves';
import { exchangeSsojetCode, SsojetAuthenticationError, SsojetRequestError, SsojetUnavailableError } from './ssojet';

type Env = { Variables: { user: UserDoc } };

export type AppDeps = {
  c: Collections;
  jwtSecret: string;
  allowDevLogin: boolean;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
};

export function createApp({ c, jwtSecret, allowDevLogin, env = process.env, fetchImpl = fetch }: AppDeps) {
  const key = new TextEncoder().encode(jwtSecret);
  const app = new Hono<Env>();
  app.use('*', cors());

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
  app.use('/moves/*', auth);
  app.use('/log', auth);
  app.use('/crew', auth);
  app.use('/crew/*', auth);
  app.use('/island', auth);
  app.use('/island/*', auth);
  app.use('/voice/*', auth);

  async function auth(ctx: Context<Env>, next: () => Promise<void>) {
    const h = ctx.req.header('authorization') ?? '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : '';
    try {
      const { payload } = await jwtVerify(token, key);
      const user = await c.users.findOne({ _id: new ObjectId(payload.sub) });
      if (!user) throw new Error('no user');
      ctx.set('user', user);
    } catch {
      throw new HTTPException(401, { message: 'unauthorized' });
    }
    await next();
  }

  // ---------- me ----------
  app.get('/me', async (ctx) => {
    const user = ctx.get('user');
    const [crew, today] = await Promise.all([
      user.crewId ? c.crews.findOne({ _id: user.crewId }) : null,
      todayMoves(c, user),
    ]);
    return ctx.json({ user: publicUser(user), crew: crew && publicCrew(crew), today });
  });

  app.put('/me/limits', async (ctx) => {
    const user = ctx.get('user');
    const limits = clampLimits(await body(ctx, z.object({ swipes: z.number(), minutes: z.number() })));
    await c.users.updateOne({ _id: user._id }, { $set: { limits } });
    return ctx.json({ limits });
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

  // ---------- real-life fuel ----------
  app.post('/activities', async (ctx) => {
    const user = ctx.get('user');
    const { kind } = await body(ctx, z.object({ kind: z.enum(ACTIVITY_KINDS) }));
    const now = new Date();
    const day = dayKeyInTz(now, user.tz);
    const todays: ActivityLog[] = (await c.activities.find({ userId: user._id, day }).toArray()).map((a) => ({
      kind: a.kind,
      at: a.at.getTime(),
      supplies: a.supplies,
      moves: a.moves,
      legend: a.legend,
    }));
    const g = grantForActivity(todays, kind);
    await c.activities.insertOne({ userId: user._id, crewId: user.crewId, day, kind, supplies: g.supplies, moves: g.moves, legend: g.legend, xp: g.xp, at: now });

    const inc: Record<string, number> = { supplies: g.supplies, legend: g.legend };
    for (const [s, v] of Object.entries(g.xp)) inc[`skills.${s}`] = v;
    await c.users.updateOne({ _id: user._id }, { $inc: inc });
    if (user.crewId && g.supplies > 0) {
      await c.crews.updateOne({ _id: user.crewId }, { $inc: { 'stores.supplies': g.supplies } });
    }
    if (g.supplies > 0) await ledger(c, { crewId: user.crewId, userId: user._id, item: 'supplies', delta: g.supplies, reason: `activity:${kind}` });

    const fresh = (await c.users.findOne({ _id: user._id }))!;
    return ctx.json({ grant: g, today: await todayMoves(c, fresh, now) });
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
    if (!user.crewId) return ctx.json({ crew: null, members: [] });
    const crew = await c.crews.findOne({ _id: user.crewId });
    const members = await c.users.find({ crewId: user.crewId }).toArray();
    return ctx.json({
      crew: crew && publicCrew(crew),
      members: members.map((m) => ({ id: m._id.toHexString(), name: m.name, legend: m.legend, skills: m.skills, calmDays: m.streak.calmDays })),
    });
  });

  registerIsland(app, c, { env, fetchImpl });

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
