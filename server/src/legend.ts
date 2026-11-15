/**
 * Honor (stored as each user's `legend` field): every pirate's score. It only ever goes up.
 * A ship's Honor is the sum of its crewmates' Honor.
 * GET /legend           your rank in your crew, across all pirates, and your ship among all ships;
 *                       plus the Lodestar holder.
 * POST /legend/end-year "End the Year": the ONE Lodestar in the whole game goes to the ship with
 *                       the most Honor. Once claimed, it stays claimed; pressing again replays it.
 * Ties go to whoever set sail first (earlier account / older crew), then by id, so ranks are stable.
 */
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ObjectId } from 'mongodb';
import { createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

import type { Collections, SeasonDoc, UserDoc } from './db';
import { ledger } from './moves';

const TOP = 20;
const SORT = { legend: -1, createdAt: 1, _id: 1 } as const;
const FIELDS = { projection: { name: 1, avatarId: 1, legend: 1, crewId: 1, createdAt: 1 } } as const;
type Ranked = Pick<UserDoc, '_id' | 'name' | 'avatarId' | 'legend' | 'crewId' | 'createdAt'>;
type ShipRow = { _id: ObjectId; honor: number; sailors: number; firstAt: Date };

/** 1-based rank of a pirate among all players (or within a set of ids). */
async function rankOf(c: Collections, u: Ranked, within?: ObjectId[]) {
  const scope = within ? { _id: { $in: within } } : {};
  const ahead = await c.users.countDocuments({
    ...scope,
    $or: [
      { legend: { $gt: u.legend } },
      { legend: u.legend, createdAt: { $lt: u.createdAt } },
      { legend: u.legend, createdAt: u.createdAt, _id: { $lt: u._id } },
    ],
  });
  return ahead + 1;
}

/** Every ship, best first: total Honor of its crew. */
async function shipStandings(c: Collections): Promise<ShipRow[]> {
  return c.users.aggregate<ShipRow>([
    { $match: { crewId: { $ne: null } } },
    { $group: { _id: '$crewId', honor: { $sum: '$legend' }, sailors: { $sum: 1 }, firstAt: { $min: '$createdAt' } } },
    { $sort: { honor: -1, firstAt: 1, _id: 1 } },
  ]).toArray();
}

const isShipSeason = (s: SeasonDoc | null): s is SeasonDoc => !!s && s.key === 'lodestar';

const publicSeason = (s: SeasonDoc, me: UserDoc) => ({
  id: s._id.toHexString(),
  year: s.year,
  ships: s.ships,
  players: s.players,
  at: s.at,
  winner: s.winner
    ? {
        crewId: s.winner.crewId.toHexString(),
        crewName: s.winner.crewName,
        honor: s.winner.honor,
        isYours: !!me.crewId && s.winner.crewId.equals(me.crewId),
        members: s.winner.members.map((m) => ({ id: m.userId.toHexString(), name: m.name, avatarId: m.avatarId, honor: m.honor, isYou: m.userId.equals(me._id) })),
      }
    : null,
});

/** Constant-time password check (hashes first so lengths never leak). */
function passwordOk(given: string, expected: string) {
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function registerLegend(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections, env: NodeJS.ProcessEnv = process.env) {
  const crewNames = async (ids: (ObjectId | null)[]) => {
    const unique = [...new Set(ids.filter((id): id is ObjectId => !!id).map((id) => id.toHexString()))].map((id) => new ObjectId(id));
    const crews = await c.crews.find({ _id: { $in: unique } }, { projection: { name: 1 } }).toArray();
    return new Map(crews.map((cr) => [cr._id.toHexString(), cr.name]));
  };

  app.get('/legend', async (ctx) => {
    const user = ctx.get('user');
    const [top, players, crew, season, ships] = await Promise.all([
      c.users.find({}, FIELDS).sort(SORT).limit(TOP).toArray(),
      c.users.countDocuments({}),
      user.crewId ? c.crews.findOne({ _id: user.crewId }) : null,
      c.seasons.findOne({ key: 'lodestar' }),
      shipStandings(c),
    ]);
    const mates = crew ? await c.users.find({ _id: { $in: crew.memberIds } }, FIELDS).sort(SORT).toArray() : [];
    const names = await crewNames([...top.map((u) => u.crewId), ...ships.slice(0, TOP).map((sh) => sh._id)]);
    const holder = isShipSeason(season) ? season.winner?.crewId.toHexString() : undefined;
    const row = (u: Ranked, rank: number) => ({
      id: u._id.toHexString(), name: u.name, avatarId: u.avatarId ?? null, legend: u.legend, rank,
      crewName: u.crewId ? names.get(u.crewId.toHexString()) ?? null : null,
      isYou: u._id.equals(user._id), lodestar: !!u.crewId && u.crewId.toHexString() === holder,
    });
    const myShip = user.crewId ? ships.findIndex((sh) => sh._id.equals(user.crewId!)) : -1;
    return ctx.json({
      me: {
        legend: user.legend,
        globalRank: await rankOf(c, user),
        players,
        crewRank: crew ? await rankOf(c, user, crew.memberIds) : null,
        crewSize: crew?.memberIds.length ?? 0,
        shipRank: myShip >= 0 ? myShip + 1 : null,
        shipHonor: myShip >= 0 ? ships[myShip]!.honor : 0,
        shipCount: ships.length,
      },
      crew: mates.map((u, i) => row(u, i + 1)),
      global: top.map((u, i) => row(u, i + 1)),
      ships: ships.slice(0, TOP).map((sh, i) => ({
        id: sh._id.toHexString(), name: names.get(sh._id.toHexString()) ?? 'Unknown ship', honor: sh.honor, sailors: sh.sailors, rank: i + 1,
        isYours: !!user.crewId && sh._id.equals(user.crewId), lodestar: sh._id.toHexString() === holder,
      })),
      lodestar: isShipSeason(season) ? publicSeason(season, user) : null,
    });
  });

  app.post('/legend/end-year', async (ctx) => {
    const user = ctx.get('user');
    // Awarding the one Lodestar is permanent, so it needs the organisers' password (server-only).
    const expected = env.LODESTAR_PASSWORD;
    if (!expected) throw new HTTPException(403, { message: 'End the Year is locked on this server.' });
    const parsed = z.object({ password: z.string().max(200) }).safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success || !passwordOk(parsed.data.password, expected)) throw new HTTPException(403, { message: 'Wrong password.' });
    const claimed = await c.seasons.findOne({ key: 'lodestar' });
    if (isShipSeason(claimed)) return ctx.json({ season: publicSeason(claimed, user), alreadyClaimed: true });

    const ships = await shipStandings(c);
    const best = ships.find((sh) => sh.honor > 0);
    const crew = best ? await c.crews.findOne({ _id: best._id }) : null;
    const members = crew
      ? (await c.users.find({ crewId: crew._id }, FIELDS).sort(SORT).toArray()).map((m) => ({ userId: m._id, name: m.name, avatarId: m.avatarId ?? null, honor: m.legend }))
      : [];
    const now = new Date();
    const season: SeasonDoc = {
      _id: new ObjectId(),
      key: 'lodestar',
      year: now.getUTCFullYear(),
      winner: best && crew ? { crewId: crew._id, crewName: crew.name, honor: best.honor, members } : null,
      ships: ships.length,
      players: await c.users.countDocuments({}),
      endedBy: user._id,
      at: now,
    };
    // A nobody-has-Honor-yet press doesn't use up the one Lodestar.
    if (!season.winner) return ctx.json({ season: publicSeason(season, user), alreadyClaimed: false });
    try {
      await c.seasons.insertOne(season);
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      const winner = (await c.seasons.findOne({ key: 'lodestar' }))!;
      return ctx.json({ season: publicSeason(winner, user), alreadyClaimed: true });
    }
    await ledger(c, { crewId: crew!._id, userId: null, item: 'lodestar', delta: 1, reason: 'season:lodestar', text: `The ${crew!.name} claimed the Lodestar with ${best!.honor} Honor! The only one in all the Tidewake.` });
    return ctx.json({ season: publicSeason(season, user), alreadyClaimed: false });
  });
}
