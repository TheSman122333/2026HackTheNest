import type { FightAction, HexKey } from '@last-voyage/game';
import { create } from 'zustand';

import { api } from '@/lib/api';
import type { FightResponse, IslandView, MoveResponse } from '@/lib/types';
import { useSession } from '@/state/session';
import { playGameSound } from '@/state/gameAudio';
import { useLanguage } from '@/state/language';
import { translate as tx } from '@/features/language/i18n';

type IslandState = {
  view: IslandView | null;
  busy: boolean;
  error: string | null;
  /** short human lines from the last action, newest first */
  feed: string[];
  load: () => Promise<void>;
  move: (to: HexKey) => Promise<MoveResponse | null>;
  fight: (action: FightAction) => Promise<FightResponse | null>;
  advanceNight: () => Promise<void>;
};

const push = (feed: string[], lines: string[]) => [...lines.reverse(), ...feed].slice(0, 30);

export const useIsland = create<IslandState>((set, get) => {
  const run = async <T extends IslandView>(fn: () => Promise<T>, toLines: (r: T) => string[]): Promise<T | null> => {
    const owner = useSession.getState().me?.user.id;
    const token = useSession.getState().token;
    const current = () => owner === useSession.getState().me?.user.id && token === useSession.getState().token;
    set({ busy: true, error: null });
    try {
      const r = await fn();
      if (!current()) return null;
      set({ view: r, feed: push(get().feed, toLines(r)) });
      useSession.getState().refresh();
      return r;
    } catch (e) {
      if (current()) set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      if (current()) set({ busy: false });
    }
  };

  return {
    view: null,
    busy: false,
    error: null,
    feed: [],
    load: async () => {
      await run(() => api<IslandView>('GET', '/island'), () => []);
    },
    move: async (to) => {
      const result = await run(() => api<MoveResponse>('POST', '/island/move', { to }), (r) => r.events.map(islandLine).filter(Boolean) as string[]);
      if (result?.events.some((event) => event.type === 'moved')) playGameSound('move');
      return result;
    },
    fight: async (action) => {
      const result = await run(() => api<FightResponse>('POST', '/island/fight', { action }), (r) => r.events.map((e) => fightLine(e, r)).filter(Boolean) as string[]);
      if (result) playGameSound(action === 'tonic' ? 'heal' : action);
      return result;
    },
    advanceNight: async () => {
      await run(
        () => api<IslandView & { sailed: boolean }>('POST', '/crew/advance-night'),
        (r) => [r.sailed ? tx('The ship sailed to a new {theme} island.', { theme: tx(r.island.theme.charAt(0).toUpperCase() + r.island.theme.slice(1)) }) : tx('Night passed. New items washed ashore.')],
      );
    },
  };
});

export const ITEM_GLYPH: Record<string, string> = {
  supplies: 'Supplies',
  timber: 'Timber',
  iron: 'Iron',
  spice: 'Spice',
  shard: 'Shard',
  cutlass: 'Cutlass',
  cannon: 'Cannon',
  tonic: 'Tonic',
  chest: 'Chest',
  clue: 'Clue',
};

function islandLine(e: MoveResponse['events'][number]): string | null {
  switch (e.type) {
    case 'moved':
      return tx('Moved (−{cost} Moves)', { cost: e.cost });
    case 'found':
      return tx('Found {item}.', { item: tx(ITEM_GLYPH[e.item] ?? e.item) });
    case 'hazard':
      return tx('The {terrain} hurt you (−{damage} HP)', { terrain: tx(e.terrain.charAt(0).toUpperCase() + e.terrain.slice(1)), damage: e.damage });
    case 'washed_overboard':
      return tx('Washed overboard. Rest up, you are back tomorrow.');
    case 'boss_in_sight':
      return tx('The guardian is within reach.');
    case 'revealed':
      return null;
  }
}

function fightLine(e: FightResponse['events'][number], r: FightResponse): string | null {
  const boss = r.boss.name;
  switch (e.type) {
    case 'hit':
      return tx('{action} {damage} damage to {boss}', { action: tx(e.weapon === 'cannon' ? 'Cannon hit.' : e.crit ? 'Critical strike.' : 'Strike.'), damage: e.damage, boss });
    case 'heal':
      return tx('Healed {amount} HP', { amount: e.amount });
    case 'brace':
      return tx('You brace yourself');
    case 'boss_hit':
      return tx('{enraged}{boss} hits you for {damage}{braced}', { enraged: e.enraged ? tx('Enraged: ') : '', boss, damage: e.damage, braced: e.braced ? tx(' (braced)') : '' });
    case 'enraged':
      return tx('{boss} is enraged.', { boss });
    case 'washed_overboard':
      return tx('{boss} knocked you overboard.', { boss });
    case 'boss_defeated':
      return tx('{boss} is defeated. The island is yours!', { boss });
  }
}

// Action feedback is transient; discard the old language when the player changes it.
useLanguage.subscribe((state, previous) => {
  if (state.language !== previous.language) useIsland.setState({ feed: [] });
});
