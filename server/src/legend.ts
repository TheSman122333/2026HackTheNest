/**
 * Legend: each pirate's score for the year. It only ever goes up.
 * GET /legend         your rank in your crew and across every crew, plus the last Lodestar winner.
 * POST /legend/end-year  demo "End the Year": the top Legend pirate across all crews claims the Lodestar.
 * Ties go to whoever set sail first (earlier account), then by id, so ranks are stable.
 */
import type { Hono } from 'hono';
import { ObjectId } from 'mongodb';

import type { Collections, SeasonDoc, UserDoc } from './db';
import { ledger } from './moves';

const TOP = 20;
const SORT = { legend: -1, createdAt: 1, _id: 1 } as const;
const FIELDS = { projection: { name: 1, avatarId: 1, legend: 1, crewId: 1, createdAt: 1 } } as const;
type Ranked = Pick<UserDoc, '_id' | 'name' | 'avatarId' | 'legend' | 'crewId' | 'createdAt'>;

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

const publicSeason = (s: SeasonDoc, me: ObjectId) => ({
  id: s._id.toHexString(),
  year: s.year,
  players: s.players,
  at: s.at,
  winner: s.winner
    ? { id: s.winner.userId.toHexString(), name: s.winner.name, avatarId: s.winner.avatarId, legend: s.winner.legend, crewName: s.winner.crewName, isYou: s.winner.userId.equals(me) }
    : null,
});

export function registerLegend(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections) {
  const crewNames = async (ids: (ObjectId | null)[]) => {
    const unique = [...new Set(ids.filter((id): id is ObjectId => !!id).map((id) => id.toHexString()))].map((id) => new ObjectId(id));
    const crews = await c.crews.find({ _id: { $in: unique } }, { projection: { name: 1 } }).toArray();
    return new Map(crews.map((cr) => [cr._id.toHexString(), cr.name]));
  };

  app.get('/legend', async (ctx) => {
    const user = ctx.get('user');
    const [top, players, crew, latest] = await Promise.all([
      c.users.find({}, FIELDS).sort(SORT).limit(TOP).toArray(),
      c.users.countDocuments({}),
      user.crewId ? c.crews.findOne({ _id: user.crewId }) : null,
      c.seasons.find({}).sort({ at: -1 }).limit(1).next(),
    ]);
    const mates = crew ? await c.users.find({ _id: { $in: crew.memberIds } }, FIELDS).sort(SORT).toArray() : [];
    const names = await crewNames(top.map((u) => u.crewId));
    const champion = latest?.winner?.userId.toHexString();
    const row = (u: Ranked, rank: number) => ({
      id: u._id.toHexString(), name: u.name, avatarId: u.avatarId ?? null, legend: u.legend, rank,
      crewName: u.crewId ? names.get(u.crewId.toHexString()) ?? crew?.name ?? null : null,
      isYou: u._id.equals(user._id), lodestar: u._id.toHexString() === champion,
    });
    return ctx.json({
      me: {
        legend: user.legend,
        globalRank: await rankOf(c, user),
        players,
        crewRank: crew ? await rankOf(c, user, crew.memberIds) : null,
        crewSize: crew?.memberIds.length ?? 0,
      },
      crew: mates.map((u, i) => ({ ...row(u, i + 1), crewName: crew?.name ?? null })),
      global: top.map((u, i) => row(u, i + 1)),
      lodestar: latest ? publicSeason(latest, user._id) : null,
    });
  });

  app.post('/legend/end-year', async (ctx) => {
    const user = ctx.get('user');
    const [best] = await c.users.find({ legend: { $gt: 0 } }, FIELDS).sort(SORT).limit(1).toArray();
    const crewName = best?.crewId ? (await c.crews.findOne({ _id: best.crewId }, { projection: { name: 1 } }))?.name ?? null : null;
    const now = new Date();
    const season: SeasonDoc = {
      _id: new ObjectId(),
      year: now.getUTCFullYear(),
      winner: best ? { userId: best._id, name: best.name, avatarId: best.avatarId ?? null, legend: best.legend, crewId: best.crewId, crewName } : null,
      players: await c.users.countDocuments({}),
      endedBy: user._id,
      at: now,
    };
    await c.seasons.insertOne(season);
    if (best) {
      await ledger(c, { crewId: best.crewId, userId: best._id, item: 'lodestar', delta: 1, reason: 'season:lodestar', text: `${best.name} claimed the Lodestar with ${best.legend} Legend! The year's voyage is complete.` });
    }
    return ctx.json({ season: publicSeason(season, user._id) });
  });
}
