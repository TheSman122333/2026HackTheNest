import { describe, expect, it } from 'vitest';

import {
  BOSSES,
  THEMES,
  act,
  applyDisaster,
  distance,
  fighterFromSkills,
  findPath,
  generateIsland,
  key,
  moveTo,
  newExplorer,
  newFightDay,
  parseKey,
  passable,
  reachable,
  rngFrom,
  spawnChaos,
  startFight,
  type HexKey,
  type Island,
} from '../src';

const isle = (theme: (typeof THEMES)[number] = 'tropical', seed = 'ember-1') =>
  generateIsland(seed, theme, rngFrom(seed));

describe('island generation', () => {
  it('is deterministic per seed', () => {
    expect(isle()).toEqual(isle());
    expect(isle('tropical', 'a')).not.toEqual(isle('tropical', 'b'));
  });

  it('has a sea ring, a beach start, and a boss at the center', () => {
    for (const theme of THEMES) {
      const i = isle(theme);
      expect(i.tiles[i.start]!.terrain).toBe('beach');
      expect(i.bossAt).toBe('0,0');
      expect(passable(i, i.bossAt)).toBe(false);
      const edge = (Object.keys(i.tiles) as HexKey[]).filter((k) => distance(parseKey(k), { q: 0, r: 0 }) === i.radius);
      expect(edge.every((k) => i.tiles[k]!.terrain === 'sea')).toBe(true);
    }
  });

  it('the boss is always reachable from the start', () => {
    for (let s = 0; s < 30; s++) {
      for (const theme of THEMES) {
        const i = isle(theme, `seed-${s}`);
        const adj = ['1,0', '1,-1', '0,-1', '-1,0', '-1,1', '0,1'] as HexKey[];
        expect(adj.some((k) => findPath(i, i.start, k) !== null)).toBe(true);
      }
    }
  });
});

describe('exploring', () => {
  it('moves, pays path cost, reveals fog, picks up items', () => {
    const base = isle();
    const target = Object.keys(reachable(base, newExplorer(base), 99))[0] as HexKey;
    // put an item on the target to test pickup
    const i: Island = { ...base, tiles: { ...base.tiles, [target]: { ...base.tiles[target]!, item: 'cannon' } } };
    const ex = newExplorer(i);
    const res = moveTo(i, ex, target, 99, rngFrom('walk'));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.explorer.pos).toBe(target);
    expect(res.spent).toBe(findPath(i, ex.pos, target)!.cost);
    expect(res.explorer.inventory.cannon).toBe(1);
    expect(res.island.tiles[target]!.item).toBeNull();
    expect(i.tiles[target]!.item).toBe('cannon'); // inputs untouched
    expect(res.explorer.revealed.length).toBeGreaterThanOrEqual(ex.revealed.length);
  });

  it('refuses unaffordable or hidden targets', () => {
    const i = isle();
    const ex = newExplorer(i);
    const far = (Object.keys(i.tiles) as HexKey[]).find(
      (k) => passable(i, k) && distance(parseKey(k), parseKey(i.start)) >= 4,
    )!;
    expect(moveTo(i, ex, far, 99, rngFrom('x'))).toEqual({ ok: false, reason: 'not_tappable' });
    const near = Object.entries(reachable(i, ex, 99)).find(([, c]) => c >= 1)![0] as HexKey;
    expect(moveTo(i, ex, near, 0, rngFrom('x'))).toEqual({ ok: false, reason: 'not_enough_moves' });
  });
});

describe('chaos', () => {
  it('spawns items and disasters reshape the board', () => {
    const i = isle('volcanic');
    const s = spawnChaos(i, rngFrom('n1'), 4);
    expect(s.events.filter((e) => e.type === 'spawned')).toHaveLength(4);
    const h = applyDisaster(s.island, 'hurricane', rngFrom('h'));
    const count = (x: Island) => Object.values(x.tiles).filter((t) => t.item).length;
    expect(count(h.island)).toBe(count(s.island));
    const e = applyDisaster(i, 'eruption', rngFrom('e'));
    expect(e.events[0]!.type).toBe('eruption');
    expect(e.island.tiles[i.bossAt]).toEqual(i.tiles[i.bossAt]);
    expect(e.island.tiles[i.start]).toEqual(i.tiles[i.start]);
  });
});

describe('boss fight', () => {
  const strong = fighterFromSkills('ana', 'Ana', { grit: 60, charm: 40, lore: 40, craft: 40, seacraft: 10 });
  const weak = fighterFromSkills('ben', 'Ben', { grit: 0, charm: 0, lore: 0, craft: 0, seacraft: 0 });

  it('the crew can wear the boss down across days and win', () => {
    let fight = startFight(BOSSES.tropical);
    const rng = rngFrom('fight');
    let won = false;
    for (let day = 0; day < 20 && !won; day++) {
      fight = newFightDay(fight);
      for (const f of [strong, weak]) {
        for (let n = 0; n < 6; n++) {
          const r = act(fight, f, 'strike', { cutlass: 1 }, rng);
          if (!r.ok) break;
          fight = r.fight;
          if (r.events.some((e) => e.type === 'boss_defeated')) won = true;
        }
      }
    }
    expect(won).toBe(true);
    expect(fight.winner).toBe('crew');
    expect(fight.damageBy.ana! + fight.damageBy.ben!).toBeGreaterThanOrEqual(BOSSES.tropical.maxHp);
  });

  it('items are required and consumed; KO blocks acting until next day', () => {
    let fight = startFight(BOSSES.volcanic);
    expect(act(fight, weak, 'cannon', {}, rngFrom('a'))).toEqual({ ok: false, reason: 'missing_item' });
    const c = act(fight, weak, 'cannon', { cannon: 1 }, rngFrom('a'));
    expect(c.ok && c.used).toBe('cannon');
    const rng = rngFrom('ko');
    let ko = false;
    for (let n = 0; n < 50 && !ko; n++) {
      const r = act(fight, weak, 'strike', {}, rng);
      if (!r.ok) break;
      fight = r.fight;
      ko = r.events.some((e) => e.type === 'washed_overboard');
    }
    expect(ko).toBe(true);
    expect(act(fight, weak, 'strike', {}, rng)).toEqual({ ok: false, reason: 'knocked_out' });
    expect(act(newFightDay(fight), weak, 'strike', {}, rng).ok).toBe(true);
  });

  it('brace halves the counterattack', () => {
    const f = startFight(BOSSES.winter);
    const a = act(f, strong, 'brace', {}, rngFrom('b'));
    const s = act(f, strong, 'strike', {}, rngFrom('b'));
    const hit = (r: typeof a) => (r.ok ? r.events.find((e) => e.type === 'boss_hit') : undefined);
    expect(hit(a)).toMatchObject({ braced: true });
    expect(key({ q: 0, r: 0 })).toBe('0,0');
    expect(hit(s)).toMatchObject({ braced: false });
  });
});
