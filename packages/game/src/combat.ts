/**
 * Boss fights: async co-op, turn-based. Boss HP persists across crewmates and days, so friends
 * chip away at it whenever they play. Each action costs 1 Island Move (charged by the caller).
 * Cartoony: a KO means "washed overboard" (respawn at the ship tomorrow), never death.
 */
import type { Skill } from './config';
import type { IslandTheme, Item } from './island';
import { int, type Rng } from './rng';

export type BossDef = {
  key: string;
  name: string;
  title: string;
  maxHp: number;
  atk: number;
  armor: number;
  /** below this HP fraction the boss enrages (+50% damage) */
  enrageAt: number;
};

export const BOSSES: Record<IslandTheme, BossDef> = {
  tropical: { key: 'tide_crab', name: 'Clawdius', title: 'the Tide Crab', maxHp: 120, atk: 6, armor: 2, enrageAt: 0.3 },
  spooky: { key: 'bog_lantern', name: 'Wispwick', title: 'the Bog Lantern', maxHp: 110, atk: 7, armor: 1, enrageAt: 0.3 },
  winter: { key: 'frost_walrus', name: 'Rimecoil', title: 'the Frost Serpent', maxHp: 140, atk: 5, armor: 3, enrageAt: 0.3 },
  volcanic: { key: 'lava_golem', name: 'Cindertail', title: 'the Magma Scorpion', maxHp: 160, atk: 7, armor: 3, enrageAt: 0.25 },
};

export type Fighter = {
  id: string;
  name: string;
  maxHp: number;
  atk: number;
  /** 0..1 crit chance (Charm: dazzling flourish) */
  crit: number;
  /** flat bonus vs boss (Lore: knows its weak spot) */
  weakSpot: number;
};

export const COMBAT = {
  cutlassBonus: 3,
  cannonDamage: 14,
  tonicHeal: 15,
  critMult: 2,
  braceFactor: 0.5,
  enrageMult: 1.5,
} as const;

/** Derive combat stats from life-sim skills (0–100). */
export function fighterFromSkills(id: string, name: string, skills: Record<Skill, number>): Fighter {
  return {
    id,
    name,
    maxHp: 25 + Math.floor(skills.grit / 2),
    atk: 4 + Math.floor((skills.grit + skills.craft) / 20),
    crit: Math.min(0.5, 0.05 + skills.charm / 300),
    weakSpot: Math.floor(skills.lore / 20),
  };
}

export type FighterState = { hp: number; braced: boolean };

export type Fight = {
  boss: BossDef;
  bossHp: number;
  round: number;
  fighters: Record<string, FighterState>;
  winner: 'crew' | null;
  /** fighter ids credited with damage (for Legend) */
  damageBy: Record<string, number>;
};

export type FightAction = 'strike' | 'cannon' | 'tonic' | 'brace';

export type FightEvent =
  | { type: 'hit'; by: string; damage: number; crit: boolean; weapon: 'fists' | 'cutlass' | 'cannon' }
  | { type: 'heal'; who: string; amount: number }
  | { type: 'brace'; who: string }
  | { type: 'boss_hit'; target: string; damage: number; enraged: boolean; braced: boolean }
  | { type: 'enraged' }
  | { type: 'washed_overboard'; who: string }
  | { type: 'boss_defeated'; finisher: string };

export function startFight(boss: BossDef): Fight {
  return { boss, bossHp: boss.maxHp, round: 0, fighters: {}, winner: null, damageBy: {} };
}

/** A new day: everyone is back aboard at full strength. Boss HP stays. */
export function newFightDay(f: Fight): Fight {
  return { ...f, fighters: {} };
}

export type ActResult =
  | { ok: true; fight: Fight; events: FightEvent[]; used: Item | null }
  | { ok: false; reason: 'fight_over' | 'knocked_out' | 'missing_item' };

/**
 * One fighter action followed by the boss's counterattack on that fighter.
 * `inventory` is read to validate items; the caller removes the `used` item.
 */
export function act(
  fight: Fight,
  fighter: Fighter,
  action: FightAction,
  inventory: Partial<Record<Item, number>>,
  rng: Rng,
): ActResult {
  if (fight.winner) return { ok: false, reason: 'fight_over' };
  const me: FighterState = fight.fighters[fighter.id] ?? { hp: fighter.maxHp, braced: false };
  if (me.hp <= 0) return { ok: false, reason: 'knocked_out' };
  if (action === 'cannon' && !inventory.cannon) return { ok: false, reason: 'missing_item' };
  if (action === 'tonic' && !inventory.tonic) return { ok: false, reason: 'missing_item' };

  const events: FightEvent[] = [];
  const f: Fight = { ...fight, fighters: { ...fight.fighters }, damageBy: { ...fight.damageBy }, round: fight.round + 1 };
  const self: FighterState = { ...me, braced: false };
  let used: Item | null = null;
  const wasEnraged = isEnraged(fight);

  const dealt = (dmg: number) => {
    f.bossHp = Math.max(0, f.bossHp - dmg);
    f.damageBy[fighter.id] = (f.damageBy[fighter.id] ?? 0) + dmg;
  };

  if (action === 'strike') {
    const hasCutlass = (inventory.cutlass ?? 0) > 0;
    const crit = rng() < fighter.crit;
    const raw = fighter.atk + (hasCutlass ? COMBAT.cutlassBonus : 0) + fighter.weakSpot + int(rng, 0, 3);
    const dmg = Math.max(1, (crit ? raw * COMBAT.critMult : raw) - fight.boss.armor);
    dealt(dmg);
    events.push({ type: 'hit', by: fighter.id, damage: dmg, crit, weapon: hasCutlass ? 'cutlass' : 'fists' });
  } else if (action === 'cannon') {
    used = 'cannon';
    dealt(COMBAT.cannonDamage);
    events.push({ type: 'hit', by: fighter.id, damage: COMBAT.cannonDamage, crit: false, weapon: 'cannon' });
  } else if (action === 'tonic') {
    used = 'tonic';
    const amount = Math.min(COMBAT.tonicHeal, fighter.maxHp - self.hp);
    self.hp += amount;
    events.push({ type: 'heal', who: fighter.id, amount });
  } else {
    self.braced = true;
    events.push({ type: 'brace', who: fighter.id });
  }

  if (f.bossHp === 0) {
    f.winner = 'crew';
    f.fighters[fighter.id] = self;
    events.push({ type: 'boss_defeated', finisher: fighter.id });
    return { ok: true, fight: f, events, used };
  }

  const enraged = isEnraged(f);
  if (enraged && !wasEnraged) events.push({ type: 'enraged' });
  let dmg = fight.boss.atk + int(rng, 0, 3);
  if (enraged) dmg = Math.round(dmg * COMBAT.enrageMult);
  if (self.braced) dmg = Math.round(dmg * COMBAT.braceFactor);
  self.hp = Math.max(0, self.hp - dmg);
  events.push({ type: 'boss_hit', target: fighter.id, damage: dmg, enraged, braced: self.braced });
  self.braced = false;
  if (self.hp === 0) events.push({ type: 'washed_overboard', who: fighter.id });
  f.fighters[fighter.id] = self;

  return { ok: true, fight: f, events, used };
}

export const isEnraged = (f: Fight) => f.bossHp > 0 && f.bossHp / f.boss.maxHp < f.boss.enrageAt;
