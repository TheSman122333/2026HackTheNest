/**
 * Island + boss-fight endpoints. The engine is pure (packages/game); this file loads state,
 * charges Moves, applies the result, and writes Log entries.
 */
import {
  BOSSES,
  THEMES,
  act,
  applyDisaster,
  dayKeyInTz,
  fighterFromSkills,
  generateIsland,
  moveTo,
  newExplorer,
  newFightDay,
  nextToBoss,
  reachable,
  respawn,
  rngFrom,
  spawnChaos,
  startFight,
  type Explorer,
  type HexKey,
  type Item,
} from '@last-voyage/game';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ObjectId } from 'mongodb';
import { z } from 'zod';

import type { Collections, IslandDoc, UserDoc } from './db';
import { ledger, spendMoves, todayMoves } from './moves';

/** Found materials go to the crew store; gear stays in the explorer's bag. */
const MATERIALS: readonly Item[] = ['supplies', 'timber', 'iron', 'spice', 'shard'];
const LEGEND = { bossParticipant: 3, bossFinisher: 5 } as const;

export async function createIsland(c: Collections, crewId: ObjectId, index: number): Promise<IslandDoc> {
  const theme = THEMES[index % THEMES.length]!;
  const id = `${crewId.toHexString()}-${index}`;
  const doc: IslandDoc = {
    _id: new ObjectId(),
    crewId,
    index,
    island: generateIsland(id, theme, rngFrom(id)),
    fight: startFight(BOSSES[theme]),
    fightDay: null,
    conqueredAt: null,
    createdAt: new Date(),
  };
  await c.islands.insertOne(doc);
  return doc;
}

export async function currentIsland(c: Collections, crewId: ObjectId): Promise<IslandDoc> {
  const doc = await c.islands.find({ crewId }).sort({ index: -1 }).limit(1).next();
  return doc ?? createIsland(c, crewId, 0);
}

async function loadExplorer(c: Collections, user: UserDoc, isle: IslandDoc, day: string): Promise<Explorer> {
  const maxHp = fighterFromSkills('x', 'x', user.skills).maxHp;
  const doc = await c.explorers.findOne({ userId: user._id, islandDocId: isle._id });
  if (!doc) {
    const ex = newExplorer(isle.island, maxHp);
    await c.explorers.insertOne({ userId: user._id, islandDocId: isle._id, explorer: ex, day });
    return ex;
  }
  if (doc.day !== day) {
    // New day: full HP. If you were washed overboard, you wake up back at the landing beach.
    const ex = doc.explorer.hp <= 0 ? respawn(isle.island, { ...doc.explorer, maxHp }) : { ...doc.explorer, hp: maxHp, maxHp };
    await c.explorers.updateOne({ _id: doc._id }, { $set: { explorer: ex, day } });
    return ex;
  }
  return doc.explorer;
}

const saveExplorer = (c: Collections, user: UserDoc, isle: IslandDoc, explorer: Explorer) =>
  c.explorers.updateOne({ userId: user._id, islandDocId: isle._id }, { $set: { explorer } });

function requireCrew(user: UserDoc): ObjectId {
  if (!user.crewId) throw new HTTPException(409, { message: 'join a crew first' });
  return user.crewId;
}

async function charge(c: Collections, user: UserDoc, n: number) {
  try {
    await spendMoves(c, user, n);
  } catch {
    throw new HTTPException(409, { message: 'not enough moves' });
  }
}

export function registerIsland(app: Hono<{ Variables: { user: UserDoc } }>, c: Collections) {
  const view = async (user: UserDoc) => {
    const crewId = requireCrew(user);
    const isle = await currentIsland(c, crewId);
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    const today = await todayMoves(c, user);
    const others = await c.explorers.find({ islandDocId: isle._id, userId: { $ne: user._id } }).toArray();
    const names = await c.users
      .find({ _id: { $in: others.map((o) => o.userId) } }, { projection: { name: 1 } })
      .toArray();
    const nameOf = new Map(names.map((n) => [n._id.toHexString(), n.name]));
    return {
      island: {
        id: isle._id.toHexString(),
        index: isle.index,
        theme: isle.island.theme,
        radius: isle.island.radius,
        start: isle.island.start,
        bossAt: isle.island.bossAt,
        // Fog: only send terrain/items for hexes this player has revealed.
        tiles: Object.fromEntries(
          explorer.revealed.map((k) => [k, isle.island.tiles[k]]).filter(([, t]) => t !== undefined),
        ),
        allHexes: Object.keys(isle.island.tiles),
        conquered: isle.conqueredAt !== null,
      },
      explorer,
      crewmates: others.map((o) => ({ userId: o.userId.toHexString(), name: nameOf.get(o.userId.toHexString()) ?? '?', pos: o.explorer.pos, hp: o.explorer.hp })),
      reachable: explorer.hp > 0 ? reachable(isle.island, explorer, today.moves.remaining) : {},
      canFight: explorer.hp > 0 && !isle.conqueredAt && nextToBoss(isle.island, explorer),
      boss: { ...isle.fight.boss, hp: isle.fight.bossHp, defeated: isle.fight.winner === 'crew' },
      movesRemaining: today.moves.remaining,
    };
  };

  app.get('/island', async (ctx) => ctx.json(await view(ctx.get('user'))));

  app.post('/island/move', async (ctx) => {
    const user = ctx.get('user');
    const { to } = z.object({ to: z.string().regex(/^-?\d+,-?\d+$/) }).parse(await ctx.req.json());
    const isle = await currentIsland(c, requireCrew(user));
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    const today = await todayMoves(c, user);

    const res = moveTo(isle.island, explorer, to as HexKey, today.moves.remaining, rngFrom(user._id.toHexString(), Date.now()));
    if (!res.ok) throw new HTTPException(409, { message: res.reason });
    await charge(c, user, res.spent);

    // Split loot: materials → crew store, gear stays in the bag, chests open on the spot.
    const ex = { ...res.explorer, inventory: { ...res.explorer.inventory } };
    const toStore: Record<string, number> = {};
    for (const e of res.events) {
      if (e.type !== 'found') continue;
      if (MATERIALS.includes(e.item)) {
        ex.inventory[e.item] = (ex.inventory[e.item] ?? 1) - 1;
        if (!ex.inventory[e.item]) delete ex.inventory[e.item];
        const qty = e.item === 'supplies' ? 3 : 1;
        toStore[e.item] = (toStore[e.item] ?? 0) + qty;
      } else if (e.item === 'chest') {
        ex.inventory.chest = (ex.inventory.chest ?? 1) - 1;
        if (!ex.inventory.chest) delete ex.inventory.chest;
        toStore.supplies = (toStore.supplies ?? 0) + 5;
        toStore.shard = (toStore.shard ?? 0) + 1;
      }
    }
    if (Object.keys(toStore).length) {
      const inc = Object.fromEntries(Object.entries(toStore).map(([k, v]) => [`stores.${k}`, v]));
      await c.crews.updateOne({ _id: isle.crewId }, { $inc: inc });
      for (const [item, delta] of Object.entries(toStore)) {
        await ledger(c, { crewId: isle.crewId, userId: user._id, item, delta, reason: 'island:loot', text: `${user.name} found ${delta} ${item}` });
      }
    }
    if (res.events.some((e) => e.type === 'washed_overboard')) {
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'hp', delta: 0, reason: 'island:ko', text: `${user.name} was washed overboard!` });
    }

    await c.islands.updateOne({ _id: isle._id }, { $set: { island: res.island } });
    await saveExplorer(c, user, isle, ex);
    return ctx.json({ events: res.events, spent: res.spent, ...(await view(user)) });
  });

  app.post('/island/fight', async (ctx) => {
    const user = ctx.get('user');
    const { action } = z.object({ action: z.enum(['strike', 'cannon', 'tonic', 'brace']) }).parse(await ctx.req.json());
    const isle = await currentIsland(c, requireCrew(user));
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    if (isle.conqueredAt) throw new HTTPException(409, { message: 'already conquered' });
    if (explorer.hp <= 0) throw new HTTPException(409, { message: 'washed overboard until tomorrow' });
    if (!nextToBoss(isle.island, explorer)) throw new HTTPException(409, { message: 'not next to the boss' });

    // Fighters map resets daily; this fighter enters with their island HP.
    let fight = isle.fightDay === day ? isle.fight : newFightDay(isle.fight);
    const fighter = { ...fighterFromSkills(user._id.toHexString(), user.name, user.skills), maxHp: explorer.maxHp };
    fight = { ...fight, fighters: { ...fight.fighters, [fighter.id]: { hp: explorer.hp, braced: false } } };

    const r = act(fight, fighter, action, explorer.inventory, rngFrom(fighter.id, Date.now()));
    if (!r.ok) throw new HTTPException(409, { message: r.reason });
    await charge(c, user, 1);

    const ex: Explorer = { ...explorer, hp: r.fight.fighters[fighter.id]!.hp, inventory: { ...explorer.inventory } };
    if (r.used) {
      ex.inventory[r.used] = (ex.inventory[r.used] ?? 1) - 1;
      if (!ex.inventory[r.used]) delete ex.inventory[r.used];
    }

    const set: Partial<IslandDoc> = { fight: r.fight, fightDay: day };
    const won = r.events.some((e) => e.type === 'boss_defeated');
    if (won) {
      set.conqueredAt = new Date();
      const boss = isle.fight.boss;
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'island', delta: 1, reason: 'island:conquered', text: `${user.name} defeated ${boss.name} ${boss.title}! The island is ours!` });
      for (const id of Object.keys(r.fight.damageBy)) {
        const pts = LEGEND.bossParticipant + (id === fighter.id ? LEGEND.bossFinisher : 0);
        await c.users.updateOne({ _id: new ObjectId(id) }, { $inc: { legend: pts } });
      }
    } else if (ex.hp <= 0) {
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'hp', delta: 0, reason: 'fight:ko', text: `${isle.fight.boss.name} knocked ${user.name} overboard!` });
    }
    await c.islands.updateOne({ _id: isle._id }, { $set: set });
    await saveExplorer(c, user, isle, ex);
    return ctx.json({ events: r.events, ...(await view(user)) });
  });

  /**
   * Night resolution (demo button now; scheduled job later): chaos spawns, maybe a disaster,
   * and if the island was conquered the crew sails to the next one.
   */
  app.post('/crew/advance-night', async (ctx) => {
    const user = ctx.get('user');
    const crewId = requireCrew(user);
    const isle = await currentIsland(c, crewId);
    const rng = rngFrom(isle._id.toHexString(), Date.now());
    if (isle.conqueredAt) {
      const next = await createIsland(c, crewId, isle.index + 1);
      await ledger(c, { crewId, userId: null, item: 'voyage', delta: 1, reason: 'night:sail', text: `The ship sailed through the night and reached a ${next.island.theme} island!` });
      return ctx.json({ sailed: true, ...(await view(user)) });
    }
    let island = spawnChaos(isle.island, rng, 3).island;
    let text = 'Night fell. Strange items washed ashore.';
    const roll = rng();
    if (roll < 0.2) {
      island = applyDisaster(island, 'hurricane', rng).island;
      text = 'A hurricane tore across the island overnight, scattering everything!';
    } else if (roll < 0.3) {
      island = applyDisaster(island, 'eruption', rng).island;
      text = 'The volcano erupted overnight! The land has changed.';
    }
    await c.islands.updateOne({ _id: isle._id }, { $set: { island } });
    await ledger(c, { crewId, userId: null, item: 'night', delta: 0, reason: 'night:chaos', text });
    return ctx.json({ sailed: false, ...(await view(user)) });
  });
}
