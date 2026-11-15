/**
 * Island = a big hex board. Point-and-click: tap a hex, pay its path cost in Island Moves,
 * reveal fog, scavenge items along the way, then fight the boss at the center.
 * Pure + deterministic: the island state lives per crew on the server; explorers per player.
 */
import { DIRS, add, disk, distance, key, neighbors, parseKey, type Hex, type HexKey } from './hex';
import { int, pick, weighted, type Rng } from './rng';

export const TERRAINS = ['sea', 'beach', 'grass', 'jungle', 'rock', 'ruins', 'town', 'swamp', 'volcano', 'snow'] as const;
export type Terrain = (typeof TERRAINS)[number];

export const ITEMS = ['supplies', 'timber', 'iron', 'spice', 'shard', 'cutlass', 'cannon', 'tonic', 'chest', 'clue'] as const;
export type Item = (typeof ITEMS)[number];
/** Chaos items players can use against bosses (and to mess with the board). */
export const CHAOS_ITEMS: readonly Item[] = ['cutlass', 'cannon', 'tonic', 'chest'];

type TerrainDef = {
  label: string;
  /** Moves to ENTER this hex; null = impassable */
  cost: number | null;
  loot: Partial<Record<Item, number>>;
  /** chance to take damage when stepping in */
  hazard: number;
  /** activity bonus shown in UI (e.g. "2× outdoor quests") */
  perk?: string;
};

export const TERRAIN: Record<Terrain, TerrainDef> = {
  sea: { label: 'Sea', cost: null, loot: {}, hazard: 0 },
  beach: { label: 'Beach', cost: 1, loot: { supplies: 3, timber: 1, chest: 1 }, hazard: 0 },
  grass: { label: 'Meadow', cost: 1, loot: { supplies: 2, tonic: 2, spice: 1 }, hazard: 0, perk: '2× outdoor quests' },
  jungle: { label: 'Jungle', cost: 2, loot: { timber: 3, spice: 2, tonic: 1, chest: 1 }, hazard: 0.05, perk: '2× walk quests' },
  rock: { label: 'Crags', cost: 2, loot: { iron: 3, shard: 1 }, hazard: 0.05 },
  ruins: { label: 'Ruins', cost: 1, loot: { clue: 3, shard: 1, cutlass: 1, chest: 1 }, hazard: 0, perk: '2× read quests' },
  town: { label: 'Port Town', cost: 1, loot: { cannon: 2, tonic: 2, supplies: 1 }, hazard: 0, perk: '2× friends quests' },
  swamp: { label: 'Bog', cost: 2, loot: { spice: 2, tonic: 1, clue: 1 }, hazard: 0.15 },
  volcano: { label: 'Volcano', cost: 3, loot: { shard: 2, iron: 2 }, hazard: 0.3 },
  snow: { label: 'Snowfield', cost: 2, loot: { iron: 1, shard: 1, chest: 1 }, hazard: 0.05 },
};

export const THEMES = ['tropical', 'spooky', 'winter', 'volcanic'] as const;
export type IslandTheme = (typeof THEMES)[number];

const THEME_TERRAIN: Record<IslandTheme, Partial<Record<Terrain, number>>> = {
  tropical: { grass: 4, jungle: 5, rock: 2, ruins: 1, town: 1, swamp: 1 },
  spooky: { swamp: 5, ruins: 4, jungle: 2, rock: 2, grass: 1, town: 1 },
  winter: { snow: 6, rock: 3, grass: 1, ruins: 1, town: 1 },
  volcanic: { rock: 5, volcano: 2, jungle: 2, grass: 1, ruins: 1, town: 1 },
};

export type Tile = { terrain: Terrain; item: Item | null };

export type Island = {
  id: string;
  theme: IslandTheme;
  radius: number;
  tiles: Record<HexKey, Tile>;
  start: HexKey;
  bossAt: HexKey;
};

export type Explorer = {
  pos: HexKey;
  hp: number;
  maxHp: number;
  inventory: Partial<Record<Item, number>>;
  revealed: HexKey[];
};

export const ISLAND = {
  /** 721 hexes (was 5 = 91, ~8x): a big island you scroll around for weeks. */
  defaultRadius: 15,
  itemChance: 0.3,
  revealRadius: 1,
  hazardDamage: 5,
  baseHp: 30,
} as const;

/** Deterministic island from an rng (seed it with e.g. rngFrom(islandId)). */
export function generateIsland(id: string, theme: IslandTheme, rng: Rng, radius: number = ISLAND.defaultRadius): Island {
  const tiles: Record<HexKey, Tile> = {};
  const center: Hex = { q: 0, r: 0 };
  for (const h of disk(radius)) {
    const d = distance(h, center);
    let terrain: Terrain;
    if (d === radius) terrain = 'sea';
    else if (d === radius - 1) terrain = rng() < 0.85 ? 'beach' : weighted(rng, THEME_TERRAIN[theme]);
    else terrain = weighted(rng, THEME_TERRAIN[theme]);
    tiles[key(h)] = { terrain, item: null };
  }
  const bossAt = key(center);
  tiles[bossAt] = { terrain: theme === 'volcanic' ? 'volcano' : 'ruins', item: null };

  for (const [k, t] of Object.entries(tiles) as [HexKey, Tile][]) {
    if (k === bossAt || TERRAIN[t.terrain].cost === null) continue;
    if (rng() < ISLAND.itemChance) t.item = weighted(rng, TERRAIN[t.terrain].loot);
  }

  const beaches = (Object.keys(tiles) as HexKey[]).filter(
    (k) => tiles[k]!.terrain === 'beach' && distance(parseKey(k), center) === radius - 1,
  );
  const start = beaches.length ? pick(rng, beaches) : key({ q: radius - 1, r: 0 });
  tiles[start] = { terrain: 'beach', item: null };

  return { id, theme, radius, tiles, start, bossAt };
}

export function newExplorer(island: Island, maxHp: number = ISLAND.baseHp): Explorer {
  return {
    pos: island.start,
    hp: maxHp,
    maxHp,
    inventory: {},
    revealed: revealAround(island, island.start, []),
  };
}

function revealAround(island: Island, at: HexKey, revealed: readonly HexKey[]): HexKey[] {
  const set = new Set(revealed);
  const c = parseKey(at);
  for (const k of Object.keys(island.tiles) as HexKey[]) {
    if (distance(parseKey(k), c) <= ISLAND.revealRadius) set.add(k);
  }
  return [...set];
}

/** A hex is passable if it exists, isn't sea and isn't the boss lair. */
export function passable(island: Island, k: HexKey): boolean {
  const t = island.tiles[k];
  return !!t && TERRAIN[t.terrain].cost !== null && k !== island.bossAt;
}

/** Cheapest path (Dijkstra; tiny boards so a simple O(n²) scan is fine). */
export function findPath(island: Island, from: HexKey, to: HexKey): { cost: number; path: HexKey[] } | null {
  if (!passable(island, to)) return null;
  const dist = new Map<HexKey, number>([[from, 0]]);
  const prev = new Map<HexKey, HexKey>();
  const open = new Set<HexKey>([from]);
  while (open.size) {
    let cur: HexKey | null = null;
    for (const k of open) if (cur === null || dist.get(k)! < dist.get(cur)!) cur = k;
    open.delete(cur!);
    if (cur === to) break;
    for (const n of neighbors(parseKey(cur!))) {
      const nk = key(n);
      if (!passable(island, nk)) continue;
      const nd = dist.get(cur!)! + TERRAIN[island.tiles[nk]!.terrain].cost!;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, cur!);
        open.add(nk);
      }
    }
  }
  if (!dist.has(to)) return null;
  const path: HexKey[] = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]!)!);
  return { cost: dist.get(to)!, path: path.slice(1) };
}

/** Hexes a player may tap: revealed ones plus the fog edge next to them. */
export function tappable(island: Island, ex: Explorer): HexKey[] {
  const set = new Set<HexKey>(ex.revealed);
  for (const k of ex.revealed) for (const n of neighbors(parseKey(k))) if (island.tiles[key(n)]) set.add(key(n));
  return [...set].filter((k) => passable(island, k) && k !== ex.pos);
}

/** Tappable hexes affordable with `moves`, with their cost (for UI highlighting). */
export function reachable(island: Island, ex: Explorer, moves: number): Record<HexKey, number> {
  const out: Record<HexKey, number> = {};
  for (const k of tappable(island, ex)) {
    const p = findPath(island, ex.pos, k);
    if (p && p.cost <= moves) out[k] = p.cost;
  }
  return out;
}

export const nextToBoss = (island: Island, ex: Explorer) => distance(parseKey(ex.pos), parseKey(island.bossAt)) === 1;

export type IslandEvent =
  | { type: 'moved'; to: HexKey; cost: number }
  | { type: 'revealed'; hexes: HexKey[] }
  | { type: 'found'; item: Item; at: HexKey }
  | { type: 'hazard'; at: HexKey; terrain: Terrain; damage: number }
  | { type: 'washed_overboard' }
  | { type: 'boss_in_sight' };

export type MoveResult =
  | { ok: true; island: Island; explorer: Explorer; spent: number; events: IslandEvent[] }
  | { ok: false; reason: 'not_tappable' | 'no_path' | 'not_enough_moves' | 'knocked_out' };

/** Walk to `target`, picking up items along the path. Returns new objects (inputs untouched). */
export function moveTo(island: Island, ex: Explorer, target: HexKey, moves: number, rng: Rng): MoveResult {
  if (ex.hp <= 0) return { ok: false, reason: 'knocked_out' };
  if (!tappable(island, ex).includes(target)) return { ok: false, reason: 'not_tappable' };
  const p = findPath(island, ex.pos, target);
  if (!p) return { ok: false, reason: 'no_path' };
  if (p.cost > moves) return { ok: false, reason: 'not_enough_moves' };

  const tiles = { ...island.tiles };
  const e: Explorer = { ...ex, inventory: { ...ex.inventory }, revealed: [...ex.revealed] };
  const events: IslandEvent[] = [{ type: 'moved', to: target, cost: p.cost }];
  const before = new Set(ex.revealed);

  for (const step of p.path) {
    e.pos = step;
    e.revealed = revealAround(island, step, e.revealed);
    const t = tiles[step]!;
    if (t.item) {
      e.inventory[t.item] = (e.inventory[t.item] ?? 0) + 1;
      events.push({ type: 'found', item: t.item, at: step });
      tiles[step] = { ...t, item: null };
    }
    if (rng() < TERRAIN[t.terrain].hazard) {
      e.hp = Math.max(0, e.hp - ISLAND.hazardDamage);
      events.push({ type: 'hazard', at: step, terrain: t.terrain, damage: ISLAND.hazardDamage });
      if (e.hp === 0) {
        events.push({ type: 'washed_overboard' });
        break;
      }
    }
  }
  const newly = e.revealed.filter((k) => !before.has(k));
  if (newly.length) events.push({ type: 'revealed', hexes: newly });
  const next = { ...island, tiles };
  if (e.hp > 0 && nextToBoss(next, e)) events.push({ type: 'boss_in_sight' });
  return { ok: true, island: next, explorer: e, spent: p.cost, events };
}

/** Respawn at the landing beach with full HP (next day, or after washing overboard). */
export function respawn(island: Island, ex: Explorer): Explorer {
  return { ...ex, pos: island.start, hp: ex.maxHp };
}

// ---------------- chaos ----------------

export type Disaster = 'hurricane' | 'eruption';

export type ChaosEvent =
  | { type: 'spawned'; item: Item; at: HexKey }
  | { type: 'hurricane'; moved: number }
  | { type: 'eruption'; at: HexKey[] };

const emptyLand = (island: Island) =>
  (Object.keys(island.tiles) as HexKey[]).filter((k) => passable(island, k) && !island.tiles[k]!.item && k !== island.start);

/** Nightly: drop `n` chaos items on empty land. */
export function spawnChaos(island: Island, rng: Rng, n: number): { island: Island; events: ChaosEvent[] } {
  const tiles = { ...island.tiles };
  const events: ChaosEvent[] = [];
  const free = emptyLand(island);
  for (let i = 0; i < n && free.length; i++) {
    const at = free.splice(int(rng, 0, free.length - 1), 1)[0]!;
    const item = pick(rng, CHAOS_ITEMS);
    tiles[at] = { ...tiles[at]!, item };
    events.push({ type: 'spawned', item, at });
  }
  return { island: { ...island, tiles }, events };
}

/** Hurricane scatters every loose item; eruption turns land around volcanoes (or a random spot) to crags. */
export function applyDisaster(island: Island, kind: Disaster, rng: Rng): { island: Island; events: ChaosEvent[] } {
  const tiles = { ...island.tiles };
  if (kind === 'hurricane') {
    const loose = (Object.keys(tiles) as HexKey[]).filter((k) => tiles[k]!.item);
    const items = loose.map((k) => tiles[k]!.item!);
    for (const k of loose) tiles[k] = { ...tiles[k]!, item: null };
    const free = emptyLand({ ...island, tiles });
    for (const item of items) {
      if (!free.length) break;
      const at = free.splice(int(rng, 0, free.length - 1), 1)[0]!;
      tiles[at] = { ...tiles[at]!, item };
    }
    return { island: { ...island, tiles }, events: [{ type: 'hurricane', moved: items.length }] };
  }
  const vents = (Object.keys(tiles) as HexKey[]).filter((k) => tiles[k]!.terrain === 'volcano' && k !== island.bossAt);
  const origin = vents.length ? pick(rng, vents) : pick(rng, emptyLand(island));
  const hit: HexKey[] = [];
  for (const d of [{ q: 0, r: 0 }, ...DIRS]) {
    const k = key(add(parseKey(origin), d));
    if (k === island.bossAt || k === island.start || !passable(island, k)) continue;
    tiles[k] = { terrain: d.q === 0 && d.r === 0 ? 'volcano' : 'rock', item: null };
    hit.push(k);
  }
  return { island: { ...island, tiles }, events: [{ type: 'eruption', at: hit }] };
}
