/**
 * Approved sprites (assets/sprites/manifest.json), sliced into apps/mobile/assets/game by
 * assets/sprites/slice.mjs. Metro needs static requires, so every sprite is listed here.
 */
import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

const S = {
  // inventory
  cutlass: require('../../assets/game/items/cutlass.png'),
  tonic: require('../../assets/game/items/tonic.png'),
  chest: require('../../assets/game/items/chest.png'),
  chest_open: require('../../assets/game/items/chest_open.png'),
  cannon: require('../../assets/game/items/cannon.png'),
  shield: require('../../assets/game/items/shield.png'),
  boots: require('../../assets/game/items/boots.png'),
  map: require('../../assets/game/items/map.png'),
  key: require('../../assets/game/items/key.png'),
  hourglass: require('../../assets/game/items/hourglass.png'),
  coin: require('../../assets/game/items/coin.png'),
  shard: require('../../assets/game/items/shard.png'),
  dice: require('../../assets/game/items/dice.png'),
  journal: require('../../assets/game/items/journal.png'),
  compass: require('../../assets/game/items/compass.png'),
  ring: require('../../assets/game/items/ring.png'),
  // quest icons
  q_walk: require('../../assets/game/quests/walk.png'),
  q_read: require('../../assets/game/quests/read.png'),
  q_workout: require('../../assets/game/quests/workout.png'),
  q_mindful: require('../../assets/game/quests/mindful.png'),
  q_chores: require('../../assets/game/quests/chores.png'),
  q_friends: require('../../assets/game/quests/friends.png'),
  q_study: require('../../assets/game/quests/study.png'),
  q_savings: require('../../assets/game/quests/savings.png'),
  q_food: require('../../assets/game/quests/food.png'),
  q_water: require('../../assets/game/quests/water.png'),
  q_sleep: require('../../assets/game/quests/sleep.png'),
  q_hobby: require('../../assets/game/quests/hobby.png'),
  // tokens
  t_leaf: require('../../assets/game/tokens/leaf.png'),
  t_book: require('../../assets/game/tokens/book.png'),
  t_chest: require('../../assets/game/tokens/chest.png'),
  t_mystery: require('../../assets/game/tokens/mystery.png'),
  t_campfire: require('../../assets/game/tokens/campfire.png'),
  t_heart: require('../../assets/game/tokens/heart.png'),
  t_swirl: require('../../assets/game/tokens/swirl.png'),
  t_rage: require('../../assets/game/tokens/rage.png'),
  t_flag: require('../../assets/game/tokens/flag.png'),
  t_star: require('../../assets/game/tokens/star.png'),
  t_anchor: require('../../assets/game/tokens/anchor.png'),
  t_lock: require('../../assets/game/tokens/lock.png'),
  // effects
  fx_claw: require('../../assets/game/effects/claw.png'),
  fx_storm: require('../../assets/game/effects/storm.png'),
  fx_wave: require('../../assets/game/effects/wave.png'),
  fx_heal: require('../../assets/game/effects/heal.png'),
  fx_shield_break: require('../../assets/game/effects/shield_break.png'),
  fx_footsteps: require('../../assets/game/effects/footsteps.png'),
  fx_spark: require('../../assets/game/effects/spark.png'),
  fx_slam: require('../../assets/game/effects/slam.png'),
  // months (island cards)
  m_jan: require('../../assets/game/months/jan.png'),
  m_feb: require('../../assets/game/months/feb.png'),
  m_mar: require('../../assets/game/months/mar.png'),
  m_apr: require('../../assets/game/months/apr.png'),
  m_may: require('../../assets/game/months/may.png'),
  m_jun: require('../../assets/game/months/jun.png'),
  m_jul: require('../../assets/game/months/jul.png'),
  m_aug: require('../../assets/game/months/aug.png'),
  m_sep: require('../../assets/game/months/sep.png'),
  m_oct: require('../../assets/game/months/oct.png'),
  m_nov: require('../../assets/game/months/nov.png'),
  m_dec: require('../../assets/game/months/dec.png'),
  // bosses
  b_crab: require('../../assets/game/bosses/crab.png'),
  b_angler: require('../../assets/game/bosses/angler.png'),
  b_serpent: require('../../assets/game/bosses/serpent.png'),
  b_scorpion: require('../../assets/game/bosses/scorpion.png'),
  b_turtle: require('../../assets/game/bosses/turtle.png'),
  b_octopus: require('../../assets/game/bosses/octopus.png'),
  // avatars
  a1: require('../../assets/game/avatars/a1.png'),
  a2: require('../../assets/game/avatars/a2.png'),
  a3: require('../../assets/game/avatars/a3.png'),
  a4: require('../../assets/game/avatars/a4.png'),
  a5: require('../../assets/game/avatars/a5.png'),
  a6: require('../../assets/game/avatars/a6.png'),
  a7: require('../../assets/game/avatars/a7.png'),
  a8: require('../../assets/game/avatars/a8.png'),
  a9: require('../../assets/game/avatars/a9.png'),
  a10: require('../../assets/game/avatars/a10.png'),
  a11: require('../../assets/game/avatars/a11.png'),
  a12: require('../../assets/game/avatars/a12.png'),
} as const;

export type SpriteName = keyof typeof S;

export function Sprite({ name, size = 32, style }: { name: SpriteName; size?: number; style?: StyleProp<ImageStyle> }) {
  return <Image source={S[name]} style={[{ width: size, height: size }, style]} contentFit="contain" />;
}

/** Island items → sprite (materials without art fall back to null → caller shows a glyph). */
export const ITEM_SPRITE: Partial<Record<string, SpriteName>> = {
  cutlass: 'cutlass',
  tonic: 'tonic',
  chest: 'chest',
  cannon: 'cannon',
  shard: 'shard',
  clue: 'map',
  supplies: 'coin',
  timber: 't_leaf',
  iron: 'key',
  spice: 'q_food',
};

export const ACTIVITY_SPRITE: Record<string, SpriteName> = {
  walk: 'q_walk',
  workout: 'q_workout',
  outdoors: 't_leaf',
  read: 'q_read',
  study: 'q_study',
  hobby: 'q_hobby',
  friends: 'q_friends',
  chores: 'q_chores',
  journal: 'journal',
};

export const BOSS_SPRITE: Record<string, SpriteName> = {
  tide_crab: 'b_crab',
  bog_lantern: 'b_angler',
  frost_walrus: 'b_serpent',
  frost_serpent: 'b_serpent',
  lava_golem: 'b_scorpion',
  magma_scorpion: 'b_scorpion',
};

export const THEME_CARD: Record<string, SpriteName> = {
  tropical: 'm_jul',
  spooky: 'm_oct',
  winter: 'm_dec',
  volcanic: 'm_sep',
};

const AVATARS: SpriteName[] = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6', 'a7', 'a8', 'a9', 'a10', 'a11', 'a12'];
/** Stable avatar per player id. */
export function avatarFor(id: string): SpriteName {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return AVATARS[h % AVATARS.length]!;
}

export const MONTH_CARD: SpriteName[] = ['m_jan', 'm_feb', 'm_mar', 'm_apr', 'm_may', 'm_jun', 'm_jul', 'm_aug', 'm_sep', 'm_oct', 'm_nov', 'm_dec'];
