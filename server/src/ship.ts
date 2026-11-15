import { ACTIVITIES, dayKeyInTz, type IslandTheme } from '@last-voyage/game';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Collections, CrewDoc, UserDoc } from './db';
import { currentIsland } from './island';
import { todayMoves } from './moves';

export const SHIP_UPGRADES = {
  helm: { name: "Navigator's helm", description: 'A truer heading makes the next voyage easier to prepare.', perLevel: 10 },
  sails: { name: 'Windcatcher sails', description: 'Better rigging catches more wind from the effort your crew earns.', perLevel: 10 },
} as const;
export type UpgradeKey = keyof typeof SHIP_UPGRADES;
const MAX_LEVEL = 3;
const BASE_ROUTE_MOVES = 120;
const ISLAND_NAMES: Record<IslandTheme, string> = { tropical: 'Palmshade Isle', spooky: 'Gloomhollow', winter: 'Frostmere', volcanic: 'Cinderpeak' };
const MONTH_ISLANDS: { name: string; theme: IslandTheme; event: string }[] = [
  { name: 'Dawnfrost Cay', theme: 'winter', event: 'New Year' },
  { name: 'Beacon Harbor', theme: 'tropical', event: 'Black History Month' },
  { name: 'Starward Reach', theme: 'tropical', event: "Women's History Month" },
  { name: 'Bloomtide Isle', theme: 'tropical', event: 'Spring' },
  { name: 'Stillwater Haven', theme: 'tropical', event: 'Mental Health Awareness' },
  { name: 'Prismwake Atoll', theme: 'tropical', event: 'Pride' },
  { name: 'Suncrest Shoals', theme: 'tropical', event: 'Summer' },
  { name: 'Chartmaker Cay', theme: 'tropical', event: 'Back to School' },
  { name: 'Emberrest Isle', theme: 'volcanic', event: 'Self-Care' },
  { name: 'Lanternmist Hollow', theme: 'spooky', event: 'Spooky Season' },
  { name: 'Quiet Beacon', theme: 'spooky', event: 'Remembrance' },
  { name: 'Snowglow Anchorage', theme: 'winter', event: 'Winter Holidays' },
];

export const shipLevel = (crew: CrewDoc | null, key: UpgradeKey) => Math.max(0, Math.min(MAX_LEVEL, Math.floor(crew?.upgrades?.[key] ?? 0)));
export const shipWindMultiplier = (crew: CrewDoc | null) => 1 + shipLevel(crew, 'sails') * 0.1;
const emptyMetrics = () => ({ quests: 0, coins: 0, moves: 0, bossDamage: 0, upgrades: 0, suppliesInvested: 0, steps: 0 });
const clamp = (value: number) => Math.max(0, Math.min(1, value));

export function nextMonthIsland(month: string) {
  const [year, number] = month.split('-').map(Number) as [number, number];
  const next = new Date(Date.UTC(year, number, 1));
  const key = next.toISOString().slice(0, 7);
  return { month: key, monthLabel: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(next), ...MONTH_ISLANDS[next.getUTCMonth()]! };
}

/** Materialize canonical purchases into the append-only Log, without risking another debit. */
async function syncUpgradeLog(c: Collections, crew: CrewDoc) {
  for (const entry of crew.upgradeLog ?? []) {
    try { await c.ledger.updateOne({ eventId: `ship-upgrade:${entry.id}` }, { $setOnInsert: {
      crewId: crew._id, userId: new ObjectId(entry.userId), item: 'supplies', delta: -entry.cost,
      reason: `ship:upgrade:${entry.key}`, eventId: `ship-upgrade:${entry.id}`,
      text: `${SHIP_UPGRADES[entry.key].name} upgraded to level ${entry.level} for ${entry.cost} Supplies.`, at: entry.at,
    } }, { upsert: true }); } catch (error) {
      // Another reader may have materialized the same canonical purchase concurrently.
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
  }
}

export async function shipDeck(c: Collections, user: UserDoc, now = new Date()) {
  if (!user.crewId) throw new HTTPException(409, { message: 'join a crew first' });
  const crew = await c.crews.findOne({ _id: user.crewId });
  if (!crew || !crew.memberIds.some((id) => id.equals(user._id))) throw new HTTPException(403, { message: 'not a member of this crew' });
  await syncUpgradeLog(c, crew);
  let timeZone = user.tz;
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(now); } catch { timeZone = 'UTC'; }
  const month = dayKeyInTz(now, timeZone).slice(0, 7);
  const inMonth = (at: Date) => dayKeyInTz(at, timeZone).startsWith(month);
  const [members, activities, entries, islands, isle] = await Promise.all([
    c.users.find({ crewId: crew._id }).toArray(),
    c.activities.find({ crewId: crew._id }).toArray(),
    c.ledger.find({ crewId: crew._id }).sort({ at: -1 }).toArray(),
    c.islands.find({ crewId: crew._id }).toArray(),
    currentIsland(c, crew._id),
  ]);
  const [days, explorers, dayLogs] = await Promise.all([
    Promise.all(members.map((member) => todayMoves(c, member, now))),
    c.explorers.find({ islandDocId: isle._id }).toArray(),
    c.dayLogs.find({ userId: { $in: members.map((member) => member._id) } }).toArray(),
  ]);
  const windMultiplier = shipWindMultiplier(crew);
  const baseAverageMoves = members.length ? days.reduce((total, day) => total + day.moves.total, 0) / members.length : 0;
  const earnedMoves = activities.filter((activity) => inMonth(activity.at)).reduce((total, activity) => total + activity.moves, 0);
  const effectiveMoves = Number((earnedMoves * windMultiplier).toFixed(1));
  const targetMoves = Math.round(BASE_ROUTE_MOVES * (1 - shipLevel(crew, 'helm') * 0.1));
  const land = new Set(Object.entries(isle.island.tiles).filter(([, tile]) => tile.terrain !== 'sea').map(([hex]) => hex));
  const revealed = new Set(explorers.flatMap((explorer) => explorer.explorer.revealed).filter((hex) => land.has(hex)));
  return {
    crew: { id: crew._id.toHexString(), name: crew.name, stores: crew.stores },
    month: { key: month, label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric', timeZone }).format(now), timeZone },
    members: members.map((member) => {
      const id = member._id.toHexString();
      const ownActivities = activities.filter((activity) => activity.userId.equals(member._id));
      const ownEntries = entries.filter((entry) => entry.userId?.equals(member._id));
      const purchases = (crew.upgradeLog ?? []).filter((entry) => entry.userId === id);
      const metrics = (monthly: boolean) => {
        const result = emptyMetrics();
        const acts = monthly ? ownActivities.filter((activity) => inMonth(activity.at)) : ownActivities;
        const log = monthly ? ownEntries.filter((entry) => inMonth(entry.at)) : ownEntries;
        const upgrades = monthly ? purchases.filter((entry) => inMonth(entry.at)) : purchases;
        result.quests = acts.length;
        result.moves = acts.reduce((total, activity) => total + activity.moves, 0);
        result.coins = acts.reduce((total, activity) => total + activity.supplies, 0) + log.filter((entry) => entry.item === 'supplies' && entry.delta > 0 && !entry.reason.startsWith('activity:')).reduce((total, entry) => total + entry.delta, 0);
        result.bossDamage = monthly
          ? log.filter((entry) => entry.reason === 'fight:damage').reduce((total, entry) => total + entry.delta, 0)
          : islands.reduce((total, island) => total + (island.fight.damageBy[id] ?? 0), 0);
        result.upgrades = upgrades.length;
        result.suppliesInvested = upgrades.reduce((total, upgrade) => total + upgrade.cost, 0);
        // Health totals have local-day keys but no crew association: these are personal recorded steps.
        result.steps = dayLogs.filter((day) => day.userId.equals(member._id) && (!monthly || day.day.startsWith(month))).reduce((total, day) => total + day.steps, 0);
        return result;
      };
      const overall = metrics(false);
      const datedDamage = ownEntries.filter((entry) => entry.reason === 'fight:damage').reduce((total, entry) => total + entry.delta, 0);
      return {
        id, name: member.name, legend: member.legend, monthly: metrics(true), overall,
        damageNote: overall.bossDamage > datedDamage ? 'Lifetime damage includes older island records. Monthly damage includes timestamped attacks recorded since crew-deck tracking began.' : null,
        history: ownEntries.slice(0, 30).map((entry) => ({ id: entry._id!.toHexString(), text: entry.text ?? `${entry.delta > 0 ? '+' : ''}${entry.delta} ${entry.item} (${entry.reason.startsWith('activity:') ? ACTIVITIES[entry.reason.slice(9) as keyof typeof ACTIVITIES]?.label ?? 'Activity' : entry.reason})`, item: entry.item, delta: entry.delta, reason: entry.reason, at: entry.at.toISOString() })),
      };
    }),
    upgrades: (Object.keys(SHIP_UPGRADES) as UpgradeKey[]).map((key) => {
      const level = shipLevel(crew, key);
      const effect = (n: number) => key === 'sails' ? `+${n * 10}% wind from earned crew effort` : `${n * 10}% less effort needed for voyage preparation`;
      return { key, name: SHIP_UPGRADES[key].name, description: SHIP_UPGRADES[key].description, level, maxLevel: MAX_LEVEL, cost: level < MAX_LEVEL ? (level + 1) * 10 : null, effect: effect(level), nextEffect: level < MAX_LEVEL ? effect(level + 1) : null };
    }),
    sailing: { baseAverageMoves, effectiveAverageMoves: baseAverageMoves * windMultiplier, windMultiplier },
    map: {
      current: { id: isle._id.toHexString(), name: ISLAND_NAMES[isle.island.theme], theme: isle.island.theme, index: isle.index, bossName: isle.fight.boss.name, bossHp: isle.fight.bossHp, bossMaxHp: isle.fight.boss.maxHp, conquered: isle.conqueredAt !== null, conquestProgress: clamp(1 - isle.fight.bossHp / isle.fight.boss.maxHp), explored: revealed.size, totalTiles: land.size },
      next: nextMonthIsland(month),
      preparation: { earnedMoves, effectiveMoves, targetMoves, progress: clamp(effectiveMoves / targetMoves), ready: effectiveMoves >= targetMoves, source: 'Recorded quest Moves earned by this crew this month', note: 'Preparation for the next monthly adventure, not distance already sailed. Current-island conquest and the normal night sailing rules still apply.' },
    },
  };
}

export function registerShip(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections) {
  app.get('/crew/deck', async (ctx) => ctx.json(await shipDeck(c, ctx.get('user'))));
  app.post('/crew/upgrades', async (ctx) => {
    const parsed = z.object({ key: z.enum(['helm', 'sails']), expectedLevel: z.number().int().min(0).max(2) }).strict().safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const user = ctx.get('user');
    if (!user.crewId) throw new HTTPException(409, { message: 'join a crew first' });
    const { key, expectedLevel } = parsed.data;
    const cost = (expectedLevel + 1) * 10;
    const path = `upgrades.${key}`;
    const previousLevel = expectedLevel === 0 ? { $or: [{ [path]: 0 }, { [path]: { $exists: false } }] } : { [path]: expectedLevel };
    const purchase = { id: randomUUID(), key, level: expectedLevel + 1, cost, userId: user._id.toHexString(), at: new Date() };
    // Debit, level, and canonical contribution are one document update: standalone Mongo works too.
    const bought = await c.crews.findOneAndUpdate({ _id: user.crewId, memberIds: user._id, 'stores.supplies': { $gte: cost }, ...previousLevel }, {
      $inc: { 'stores.supplies': -cost, [path]: 1 }, $push: { upgradeLog: purchase },
    }, { returnDocument: 'after' });
    if (!bought) throw new HTTPException(409, { message: 'Not enough Supplies, or the upgrade level changed. Refresh the deck.' });
    return ctx.json(await shipDeck(c, user));
  });
}
