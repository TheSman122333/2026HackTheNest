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
  passable,
  reachable,
  respawn,
  rngFrom,
  spawnChaos,
  startFight,
  type Explorer,
  type FightAction,
  type FightEvent,
  type HexKey,
  type IslandEvent,
  type Item,
  NARRATOR,
  normalizeLanguage,
  type AppLanguage,
} from '@last-voyage/game';
import type { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { Binary, ObjectId } from 'mongodb';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

import type { Collections, GmEventDoc, IslandDoc, UserDoc } from './db';
import { askTidekeeper, brainState, pickDestination, summarizeEvents, translateNarrationText } from './brain';
import { localizedVoiceStatus } from './voice-language';
import { fallbackLine, generateGmProposal, isWorldEventDay, type StreakContext } from './gm';
import { ledger, spendMoves, todayMoves } from './moves';
import {
  resolveVoiceIntent,
  responseForScene,
  responseForQuestion,
  NARRATION_SCENES,
  sfxCueKeys,
  synthesizeSpeech,
  transcribeAudio,
  VoiceProviderError,
  voiceCommandReply,
  type VoiceIntent,
} from './voice';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

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

export async function resumeVoyage(c: Collections, user: UserDoc) {
  if (!user.crewId) return { crew: null, island: null };
  const [crew, isle] = await Promise.all([
    c.crews.findOne({ _id: user.crewId }),
    currentIsland(c, user.crewId),
  ]);
  if (!crew) return { crew: null, island: null };

  const day = dayKeyInTz(new Date(), user.tz);
  const [explorer, today] = await Promise.all([
    loadExplorer(c, user, isle, day),
    todayMoves(c, user),
  ]);
  return {
    crew: { id: crew._id.toHexString(), name: crew.name, stores: crew.stores },
    island: {
      id: isle._id.toHexString(),
      index: isle.index,
      theme: isle.island.theme,
      conquered: isle.conqueredAt !== null,
      explorer,
      boss: { key: isle.fight.boss.key, hp: isle.fight.bossHp, maxHp: isle.fight.boss.maxHp },
      moves: { total: today.moves.total, spent: today.moves.spent, remaining: today.moves.remaining },
      streak: today.streak,
    },
  };
}

export async function loadExplorer(c: Collections, user: UserDoc, isle: IslandDoc, day: string): Promise<Explorer> {
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

export function registerIsland(
  app: Hono<{ Variables: { user: UserDoc } }>,
  c: Collections,
  options: { env?: NodeJS.ProcessEnv; fetchImpl?: typeof fetch } = {},
) {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;
  const view = async (user: UserDoc) => {
    const crewId = requireCrew(user);
    const isle = await currentIsland(c, crewId);
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    const today = await todayMoves(c, user);
    const others = await c.explorers.find({ islandDocId: isle._id, userId: { $ne: user._id } }).toArray();
    const names = await c.users
      .find({ _id: { $in: others.map((o) => o.userId) } }, { projection: { name: 1, avatarId: 1 } })
      .toArray();
    const nameOf = new Map(names.map((n) => [n._id.toHexString(), n.name]));
    const avatarOf = new Map(names.map((n) => [n._id.toHexString(), n.avatarId ?? null]));
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
      crewmates: others.map((o) => ({ userId: o.userId.toHexString(), name: nameOf.get(o.userId.toHexString()) ?? '?', avatarId: avatarOf.get(o.userId.toHexString()) ?? null, pos: o.explorer.pos, hp: o.explorer.hp })),
      reachable: explorer.hp > 0 ? reachable(isle.island, explorer, today.moves.remaining) : {},
      canFight: explorer.hp > 0 && !isle.conqueredAt && nextToBoss(isle.island, explorer),
      boss: { ...isle.fight.boss, hp: isle.fight.bossHp, defeated: isle.fight.winner === 'crew' },
      movesRemaining: today.moves.remaining,
    };
  };

  const performMove = async (user: UserDoc, to: string) => {
    const isle = await currentIsland(c, requireCrew(user));
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    const today = await todayMoves(c, user);
    const res = moveTo(isle.island, explorer, to as HexKey, today.moves.remaining, rngFrom(user._id.toHexString(), Date.now()));
    if (!res.ok) throw new HTTPException(409, { message: res.reason });
    await charge(c, user, res.spent);

    const ex = { ...res.explorer, inventory: { ...res.explorer.inventory } };
    const toStore: Record<string, number> = {};
    for (const event of res.events) {
      if (event.type !== 'found') continue;
      if (MATERIALS.includes(event.item)) {
        ex.inventory[event.item] = (ex.inventory[event.item] ?? 1) - 1;
        if (!ex.inventory[event.item]) delete ex.inventory[event.item];
        toStore[event.item] = (toStore[event.item] ?? 0) + (event.item === 'supplies' ? 3 : 1);
      } else if (event.item === 'chest') {
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
    if (res.events.some((event) => event.type === 'washed_overboard')) {
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'hp', delta: 0, reason: 'island:ko', text: `${user.name} was washed overboard!` });
    }
    await c.islands.updateOne({ _id: isle._id }, { $set: { island: res.island } });
    await saveExplorer(c, user, isle, ex);
    return { events: res.events, spent: res.spent, view: await view(user) };
  };

  const performFight = async (user: UserDoc, action: FightAction) => {
    const isle = await currentIsland(c, requireCrew(user));
    const day = dayKeyInTz(new Date(), user.tz);
    const explorer = await loadExplorer(c, user, isle, day);
    if (isle.conqueredAt) throw new HTTPException(409, { message: 'already conquered' });
    if (explorer.hp <= 0) throw new HTTPException(409, { message: 'washed overboard until tomorrow' });
    if (!nextToBoss(isle.island, explorer)) throw new HTTPException(409, { message: 'not next to the boss' });

    let fight = isle.fightDay === day ? isle.fight : newFightDay(isle.fight);
    const fighter = { ...fighterFromSkills(user._id.toHexString(), user.name, user.skills), maxHp: explorer.maxHp };
    fight = { ...fight, fighters: { ...fight.fighters, [fighter.id]: { hp: explorer.hp, braced: false } } };
    const result = act(fight, fighter, action, explorer.inventory, rngFrom(fighter.id, Date.now()));
    if (!result.ok) throw new HTTPException(409, { message: result.reason });
    await charge(c, user, 1);

    const ex: Explorer = { ...explorer, hp: result.fight.fighters[fighter.id]!.hp, inventory: { ...explorer.inventory } };
    if (result.used) {
      ex.inventory[result.used] = (ex.inventory[result.used] ?? 1) - 1;
      if (!ex.inventory[result.used]) delete ex.inventory[result.used];
    }

    const set: Partial<IslandDoc> = { fight: result.fight, fightDay: day };
    const won = result.events.some((event) => event.type === 'boss_defeated');
    if (won) {
      set.conqueredAt = new Date();
      const boss = isle.fight.boss;
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'island', delta: 1, reason: 'island:conquered', text: `${user.name} defeated ${boss.name} ${boss.title}! The island is ours!` });
      for (const id of Object.keys(result.fight.damageBy)) {
        const points = LEGEND.bossParticipant + (id === fighter.id ? LEGEND.bossFinisher : 0);
        await c.users.updateOne({ _id: new ObjectId(id) }, { $inc: { legend: points } });
      }
    } else if (ex.hp <= 0) {
      await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'hp', delta: 0, reason: 'fight:ko', text: `${isle.fight.boss.name} knocked ${user.name} overboard!` });
    }
    await c.islands.updateOne({ _id: isle._id }, { $set: set });
    await saveExplorer(c, user, isle, ex);
    const damage = result.events.filter((event) => event.type === 'hit').reduce((total, event) => total + event.damage, 0);
    if (damage > 0) await ledger(c, { crewId: isle.crewId, userId: user._id, item: 'boss_damage', delta: damage, reason: 'fight:damage', text: `${user.name} dealt ${damage} damage to ${isle.fight.boss.name}.` });
    return { events: result.events, view: await view(user) };
  };

  app.get('/island', async (ctx) => ctx.json(await view(ctx.get('user'))));

  app.post('/island/move', async (ctx) => {
    const parsed = z.object({ to: z.string().regex(/^-?\d+,-?\d+$/) }).safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const result = await performMove(ctx.get('user'), parsed.data.to);
    return ctx.json({ events: result.events, spent: result.spent, ...result.view });
  });

  app.post('/island/fight', async (ctx) => {
    const parsed = z.object({ action: z.enum(['strike', 'cannon', 'tonic', 'brace']) }).safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const result = await performFight(ctx.get('user'), parsed.data.action);
    return ctx.json({ events: result.events, ...result.view });
  });

  // A crew shares one event/reward, but each reader receives narration in their own language.
  const localizedEvents = new Map<string, Promise<string | null>>();
  const gmResponse = async (doc: GmEventDoc, requestId: string, status = doc.status, language: AppLanguage = 'en') => {
    let narration = doc.event.narration;
    if (language !== 'en') {
      const key = `${doc.event.id}:${language}`;
      if (!localizedEvents.has(key)) {
        if (localizedEvents.size >= 128) localizedEvents.delete(localizedEvents.keys().next().value!);
        localizedEvents.set(key, translateNarrationText(narration, language, env, fetchImpl));
      }
      const translated = await localizedEvents.get(key)!;
      if (translated) narration = translated;
      else localizedEvents.delete(key); // Retry after a transient provider outage.
    }
    return { requestId, status, event: { ...doc.event, narration }, island: { id: doc.islandDocId.toHexString(), changedTile: doc.changedTile }, audit: doc.audit };
  };

  const saveGmAudit = async (doc: GmEventDoc) => {
    try {
      await ledger(c, {
        crewId: doc.crewId,
        userId: doc.userId,
        item: 'world_event',
        delta: 0,
        reason: 'gm:event',
        eventId: doc.event.id,
        text: doc.audit.text,
      });
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
  };

  const completePendingGmEvent = async (doc: GmEventDoc) => {
    if (doc.status !== 'pending' || doc.event.effect.type !== 'spawn_item') return doc;
    const isle = await c.islands.findOne({ _id: doc.islandDocId });
    const hex = doc.event.effect.at;
    const tile = isle?.island.tiles[hex as HexKey];
    if (!isle || !tile || !passable(isle.island, hex as HexKey)) {
      const noEvent = {
        ...doc,
        status: 'no_event' as const,
        event: { ...doc.event, effect: { type: 'none' as const } },
        changedTile: null,
        audit: { ...doc.audit, text: 'No safe world effect was applied.' },
        updatedAt: new Date(),
      };
      await c.gmEvents.updateOne({ _id: doc._id, status: 'pending' }, { $set: noEvent });
      return noEvent;
    }

    let applied = tile.item === doc.event.effect.item;
    if (!tile.item) {
      const terrainPath = `island.tiles.${hex}.terrain`;
      const itemPath = `island.tiles.${hex}.item`;
      const write = await c.islands.updateOne(
        { _id: isle._id, [terrainPath]: tile.terrain, [itemPath]: null },
        { $set: { [itemPath]: doc.event.effect.item } },
      );
      applied = write.modifiedCount === 1;
    }

    const completed: GmEventDoc = applied
      ? {
          ...doc,
          status: 'applied',
          changedTile: { hex, terrain: tile.terrain, item: doc.event.effect.item },
          audit: { ...doc.audit, text: `${cap(NARRATOR.withThe)} placed ${doc.event.effect.item} on a revealed ${tile.terrain} tile.` },
          updatedAt: new Date(),
        }
      : {
          ...doc,
          status: 'no_event',
          event: { ...doc.event, effect: { type: 'none' } },
          changedTile: null,
          audit: { ...doc.audit, text: 'The selected tile was no longer safe to change; the island was left untouched.' },
          updatedAt: new Date(),
        };
    await c.gmEvents.updateOne({ _id: doc._id, status: 'pending' }, { $set: completed });
    const saved = (await c.gmEvents.findOne({ _id: doc._id })) ?? completed;
    return saved;
  };

  const persistNoGmEvent = async (
    eventKey: string,
    user: UserDoc,
    isle: IslandDoc,
    narration: string,
  ): Promise<GmEventDoc> => {
    const now = new Date();
    const doc: GmEventDoc = {
      _id: eventKey,
      eventKey,
      crewId: isle.crewId,
      islandDocId: isle._id,
      userId: user._id,
      day: now.toISOString().slice(0, 10),
      status: 'no_event',
      event: { id: eventKey, narration, sources: [], effect: { type: 'none' }, createdAt: now },
      changedTile: null,
      audit: { id: eventKey, reason: 'gm:event', text: 'No safe world effect was applied.' },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await c.gmEvents.insertOne(doc);
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
    }
    const saved = (await c.gmEvents.findOne({ eventKey }))!;
    await saveGmAudit(saved);
    return saved;
  };

  app.post('/island/gm-event', async (ctx) => {
    const language = normalizeLanguage(ctx.req.header('X-App-Language'));
    const parsed = z
      .object({ requestId: z.string().uuid(), trigger: z.enum(['daily_briefing', 'advance_night', 'scheduled']) })
      .safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });

    const user = ctx.get('user');
    const crewId = requireCrew(user);
    const isle = await currentIsland(c, crewId);
    const scheduled = parsed.data.trigger === 'scheduled';
    const day = new Date().toISOString().slice(0, 10);
    // The app asks on every island visit; only the crew's 3 event days a week actually fire.
    if (scheduled && (isle.conqueredAt || !isWorldEventDay(crewId.toHexString(), day))) {
      return ctx.json({ requestId: parsed.data.requestId, status: 'not_today' as const });
    }
    if (isle.conqueredAt) throw new HTTPException(409, { message: 'island already conquered' });
    // GM_DEMO_REPEAT=true lets judges trigger a fresh event on every press (one per day otherwise).
    const repeat = env.GM_DEMO_REPEAT === 'true' && !scheduled;
    const eventKey = `${crewId.toHexString()}:${isle._id.toHexString()}:${day}${repeat ? `:${parsed.data.requestId}` : ''}`;
    const existing = await c.gmEvents.findOne({ eventKey });
    if (existing) {
      const complete = await completePendingGmEvent(existing);
      await saveGmAudit(complete);
      return ctx.json(await gmResponse(complete, parsed.data.requestId, complete.status === 'applied' ? 'already_applied' : complete.status, language));
    }

    const today = await todayMoves(c, user);
    const streakContext: StreakContext = today.streak.shoreLeaveBonus
      ? 'shore_leave'
      : today.streak.calmDays > 0
        ? 'calm'
        : today.screen.tracked && (today.screen.swipes > user.limits.swipes || today.screen.minutes > user.limits.minutes)
          ? 'stormy'
          : 'unknown';
    await loadExplorer(c, user, isle, dayKeyInTz(new Date(), user.tz));
    const explorers = await c.explorers.find({ islandDocId: isle._id }).toArray();
    const revealed = new Set(explorers.flatMap((entry) => entry.explorer.revealed));
    const candidates = [...revealed]
      .filter((hex) => {
        const key = hex as HexKey;
        const tile = isle.island.tiles[key];
        return !!tile && !tile.item && passable(isle.island, key);
      })
      .sort();
    if (!candidates.length) {
      const narration = await fallbackLine('noTile', isle.island.theme, streakContext);
      const doc = await persistNoGmEvent(eventKey, user, isle, narration);
      return ctx.json(await gmResponse(doc, parsed.data.requestId, doc.status, language));
    }

    const proposal = await generateGmProposal({
      theme: isle.island.theme,
      streakContext,
      islandIndex: isle.index,
      bossName: isle.fight.boss.name,
      bossHp: isle.fight.bossHp,
      bossMaxHp: isle.fight.boss.maxHp,
      env,
      fetchImpl,
    });
    if (!proposal) {
      const narration = await fallbackLine('unavailable', isle.island.theme, streakContext);
      const doc = await persistNoGmEvent(eventKey, user, isle, narration);
      return ctx.json(await gmResponse(doc, parsed.data.requestId, doc.status, language));
    }

    const hex = candidates[0]!;
    const now = new Date();
    const doc: GmEventDoc = {
      _id: eventKey,
      eventKey,
      crewId,
      islandDocId: isle._id,
      userId: user._id,
      day,
      status: 'pending',
      event: {
        id: eventKey,
        narration: proposal.narration,
        sources: proposal.sources,
        effect: { type: 'spawn_item', at: hex, item: proposal.item },
        createdAt: now,
      },
      changedTile: null,
      audit: { id: eventKey, reason: 'gm:event', text: `${cap(NARRATOR.withThe)} world event is being applied.` },
      createdAt: now,
      updatedAt: now,
    };
    try {
      await c.gmEvents.insertOne(doc);
    } catch (error) {
      if (!(typeof error === 'object' && error !== null && 'code' in error && error.code === 11000)) throw error;
      const winner = (await c.gmEvents.findOne({ eventKey }))!;
      const complete = await completePendingGmEvent(winner);
      await saveGmAudit(complete);
      return ctx.json(await gmResponse(complete, parsed.data.requestId, complete.status === 'applied' ? 'already_applied' : complete.status, language));
    }
    const complete = await completePendingGmEvent(doc);
    await saveGmAudit(complete);
    return ctx.json(await gmResponse(complete, parsed.data.requestId, complete.status, language));
  });

  app.post('/island/voice-turn', async (ctx) => {
    const language = normalizeLanguage(ctx.req.header('X-App-Language'));
    const length = Number(ctx.req.header('content-length') ?? 0);
    if (length > 3 * 1024 * 1024) throw new HTTPException(413, { message: 'voice request is too large' });
    const parsed = z
      .object({
        requestId: z.string().uuid(),
        mode: z.enum(['briefing', 'command', 'narration']),
        scene: z.enum(NARRATION_SCENES).optional(),
        detail: z.string().trim().max(400).optional(),
        conversationId: z.string().min(1).max(80).nullable().optional(),
        text: z.string().trim().min(1).max(400).optional(),
        audio: z
          .object({
            mimeType: z.enum(['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm']),
            base64: z.string().min(1).max(2_900_000),
          })
          .strict()
          .optional(),
      })
      .strict()
      .safeParse(await ctx.req.json().catch(() => ({})));
    if (!parsed.success) throw new HTTPException(400, { message: parsed.error.message });
    const input = parsed.data;
    if (
      (input.mode === 'briefing' && (input.audio || input.text)) ||
      (input.mode === 'command' && Number(Boolean(input.audio)) + Number(Boolean(input.text)) !== 1) ||
      (input.mode === 'narration' && (!input.scene || input.audio || input.text)) ||
      (input.mode !== 'narration' && (input.scene !== undefined || input.detail !== undefined))
    ) {
      throw new HTTPException(400, { message: 'briefing takes no input; command requires one audio or text input; narration requires a scene and no command input' });
    }

    const user = ctx.get('user');
    requireCrew(user);
    let conversationId = input.conversationId ?? null;
    if (conversationId) {
      const conversation = await c.voiceConversations.findOne({ _id: conversationId });
      if (!conversation || !conversation.userId.equals(user._id) || conversation.expiresAt <= new Date()) {
        throw new HTTPException(404, { message: 'conversation not found' });
      }
    } else {
      conversationId = randomUUID();
      const now = new Date();
      await c.voiceConversations.insertOne({
        _id: conversationId,
        userId: user._id,
        createdAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
    }

    const existingTurn = await c.voiceTurns.findOne({ userId: user._id, requestId: input.requestId });
    if (existingTurn) {
      if (existingTurn.status === 'processing' || !existingTurn.response) {
        throw new HTTPException(409, { message: 'voice turn is still processing; refresh the game state' });
      }
      // A retry must never reapply a command, nor play audio saved in a previous app language.
      if (normalizeLanguage(existingTurn.response.language) !== language) {
        const savedReply = typeof existingTurn.response.reply === 'string' ? existingTurn.response.reply : '';
        const translated = language === 'en' ? null : await translateNarrationText(savedReply, language, env, fetchImpl);
        return ctx.json({ ...existingTurn.response, language, reply: translated ?? localizedVoiceStatus(language, await view(user)), audio: null, audioError: 'language_changed' });
      }
      const previousAudio = existingTurn.response.audio as { url?: unknown } | null | undefined;
      const audioId = typeof previousAudio?.url === 'string' ? /\/voice\/audio\/([^/]+)$/.exec(previousAudio.url)?.[1] : null;
      if (audioId) {
        const cached = await c.media.findOne({ _id: `voice:${audioId}` });
        if (!cached || (cached.expiresAt?.getTime() ?? 0) <= Date.now() || !cached.userId.equals(user._id)) {
          return ctx.json({ ...existingTurn.response, audio: null, audioError: 'speech_expired' });
        }
      }
      return ctx.json(existingTurn.response);
    }

    let transcript: string | null = null;
    if (input.audio) {
      try {
        transcript = await transcribeAudio(input.audio, env.ELEVENLABS_API_KEY, fetchImpl, language);
      } catch (error) {
        if (error instanceof VoiceProviderError) {
          console.error('[voice] transcription failed:', error.message);
          const status = error.message.includes('invalid') || error.message.includes('unsupported') || error.message.includes('15 seconds') ? 400 : 503;
          throw new HTTPException(status, { message: error.message });
        }
        throw error;
      }
    } else if (input.text) {
      transcript = input.text;
    }

    let intent: VoiceIntent = input.mode === 'narration'
      ? { type: 'narration', scene: input.scene! }
      : input.mode === 'briefing' ? { type: 'briefing' } : resolveVoiceIntent(transcript ?? '', language) ?? { type: 'question' };
    const userForTurn: UserDoc = (await c.users.findOne({ _id: user._id })) ?? user;
    const current = await view(userForTurn);
    const today = await todayMoves(c, userForTurn);
    const sceneReply = input.mode === 'narration' ? responseForScene(input.scene!, userForTurn.name, current, today, language) : null;

    // The brain (OpenAI) understands free speech and picks an allowlisted action; without a key
    // we fall back to the keyword matcher above.
    const convo = await c.voiceConversations.findOne({ _id: conversationId });
    const brain = await askTidekeeper({
      env,
      fetchImpl,
      mode: input.mode,
      language,
      narration: sceneReply ? { scene: input.scene!, facts: sceneReply, detail: input.detail } : undefined,
      text: transcript,
      state: brainState(userForTurn.name, current, {
        calmDays: today.streak.calmDays,
        shields: today.streak.shields,
        steps: today.steps,
        crewmates: current.crewmates.length,
      }),
      history: convo?.history ?? [],
    });
    // Questions never spend Moves, whatever the model picked.
    const askedQuestion = resolveVoiceIntent(transcript ?? '', language)?.type === 'question';
    if (brain && input.mode === 'command') {
      if (askedQuestion) brain.action = 'none';
      const a = brain.action;
      if (a === 'strike' || a === 'cannon' || a === 'tonic' || a === 'brace') intent = { type: 'fight', action: a };
      else if (a === 'toward_boss' || a === 'explore') {
        const to = pickDestination(current, a);
        intent = to ? { type: 'island.move', to } : { type: 'question' };
      } else intent = { type: 'question' };
    }
    console.log(`[voice] ${user.name}: "${transcript ?? '(briefing)'}" -> ${brain ? `brain:${brain.action}` : 'keywords'} -> ${intent.type}`);
    try {
      const now = new Date();
      await c.voiceTurns.insertOne({
        userId: user._id,
        requestId: input.requestId,
        status: 'processing',
        createdAt: now,
        expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      if (typeof error === 'object' && error !== null && 'code' in error && error.code === 11000) {
        throw new HTTPException(409, { message: 'voice turn already submitted; refresh the game state' });
      }
      throw error;
    }

    let reply: string;
    let result: {
      events: IslandEvent[] | FightEvent[];
      movesRemaining: number;
      playerHp: number;
      bossHp: number;
    } | null = null;
    let cues: string[] = [];

    if (intent.type === 'narration') {
      // Automatic screen/event narration cannot enter either action branch, even if a provider
      // emits an action or client context contains an order. The game state is read only here.
      reply = brain?.reply ?? sceneReply!;
    } else if (intent.type === 'briefing') {
      reply = brain?.reply ?? (language === 'en' ? `Welcome back, ${user.name}. Your crew is exploring a ${current.island.theme} island. You have ${current.movesRemaining} Moves, ${current.explorer.hp} health, and a ${today.streak.calmDays}-day Calm Seas streak. ${current.boss.name} has ${current.boss.hp} health remaining.` : localizedVoiceStatus(language, current));
      cues = today.streakEvents.flatMap((event) => {
        if (event.type === 'calm_day') return ['streak.calm_day'];
        if (event.type === 'shield_earned') return ['streak.shield_earned'];
        if (event.type === 'shield_used') return ['streak.shield_used'];
        if (event.type === 'streak_reset') return ['streak.reset'];
        if (event.type === 'shore_leave') return ['streak.shore_leave'];
        return [];
      });
    } else if (intent.type === 'question') {
      reply =
        brain?.reply ??
        (transcript && resolveVoiceIntent(transcript, language)?.type === 'question'
          ? responseForQuestion(transcript, current, today.streak.calmDays, language)
          : language === 'en' ? await fallbackLine('unclear') : localizedVoiceStatus(language, current));
    } else {
      try {
        if (intent.type === 'island.move') {
          const moved = await performMove(userForTurn, intent.to);
          reply = language !== 'en' ? `${brain?.reply ?? ''} ${localizedVoiceStatus(language, moved.view)}`.trim() : brain ? `${brain.reply} ${summarizeEvents(moved.events, current.boss.name)}`.trim() : voiceCommandReply(intent, moved.view);
          result = {
            events: moved.events,
            movesRemaining: moved.view.movesRemaining,
            playerHp: moved.view.explorer.hp,
            bossHp: moved.view.boss.hp,
          };
          cues = sfxCueKeys(moved.events);
        } else {
          const fought = await performFight(userForTurn, intent.action);
          reply = language !== 'en' ? `${brain?.reply ?? ''} ${localizedVoiceStatus(language, fought.view)}`.trim() : brain ? `${brain.reply} ${summarizeEvents(fought.events, current.boss.name)}`.trim() : voiceCommandReply(intent, fought.view);
          result = {
            events: fought.events,
            movesRemaining: fought.view.movesRemaining,
            playerHp: fought.view.explorer.hp,
            bossHp: fought.view.boss.hp,
          };
          cues = sfxCueKeys(fought.events);
        }
      } catch (error) {
        if (!(error instanceof HTTPException)) throw error;
        reply = language === 'en' ? error.message : await translateNarrationText(error.message, language, env, fetchImpl) ?? localizedVoiceStatus(language, current);
      }
    }

    // Remember the last few exchanges so follow-ups ("do it again") make sense.
    if (input.mode === 'command' && transcript) {
      const turns = [...(convo?.history ?? []), { role: 'user' as const, content: transcript }, { role: 'assistant' as const, content: reply }].slice(-8);
      await c.voiceConversations.updateOne({ _id: conversationId }, { $set: { history: turns } });
    }

    let audio: { url: string; expiresAt: string } | null = null;
    let audioError: string | null = null;
    try {
      const bytes = await synthesizeSpeech(reply, env, fetchImpl, language);
      if (bytes?.length && bytes.byteLength <= 1024 * 1024) {
        const id = randomUUID();
        const expiresAt = new Date(Date.now() + 10 * 60_000);
        // Stored in Mongo (TTL index) so any server instance can serve it.
        await c.media.insertOne({ _id: `voice:${id}`, userId: user._id, contentType: 'audio/mpeg', bytes: new Binary(bytes), createdAt: new Date(), expiresAt });
        audio = { url: `/voice/audio/${id}`, expiresAt: expiresAt.toISOString() };
      } else {
        audioError = !env.ELEVENLABS_API_KEY ? 'speech_not_configured' : bytes?.length ? 'speech_too_large' : 'speech_unavailable';
      }
    } catch {
      audioError = 'speech_unavailable';
    }

    const response = {
      language,
      requestId: input.requestId,
      conversationId,
      transcript: input.mode === 'command' ? transcript : null,
      reply,
      intent,
      result,
      audio,
      audioError,
      sfxCueKeys: cues,
    };
    await c.voiceTurns.updateOne(
      { userId: user._id, requestId: input.requestId, status: 'processing' },
      { $set: { status: 'completed', response } },
    );
    return ctx.json(response);
  });

  app.get('/voice/audio/:id', async (ctx) => {
    const user = ctx.get('user');
    const id = ctx.req.param('id');
    const cached = await c.media.findOne({ _id: `voice:${id}` });
    if (!cached || (cached.expiresAt?.getTime() ?? 0) <= Date.now()) throw new HTTPException(404, { message: 'audio expired' });
    if (!cached.userId.equals(user._id)) throw new HTTPException(403, { message: 'audio belongs to another player' });
    const bytes = cached.bytes.buffer;
    const audioBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(audioBuffer).set(bytes);
    return new Response(audioBuffer, {
      headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, no-store', 'content-length': String(bytes.byteLength) },
    });
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
    // 3 items a night on the old radius-5 island; scale with size so big islands stay lively.
    let island = spawnChaos(isle.island, rng, Math.max(3, Math.round(isle.island.radius * 0.6))).island;
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
