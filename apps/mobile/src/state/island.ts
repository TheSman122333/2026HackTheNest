import type { FightAction, HexKey } from '@last-voyage/game';
import { create } from 'zustand';

import { api } from '@/lib/api';
import type { FightResponse, IslandView, MoveResponse } from '@/lib/types';
import { useSession } from '@/state/session';

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
    set({ busy: true, error: null });
    try {
      const r = await fn();
      set({ view: r, feed: push(get().feed, toLines(r)) });
      useSession.getState().refresh();
      return r;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
      return null;
    } finally {
      set({ busy: false });
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
    move: (to) => run(() => api<MoveResponse>('POST', '/island/move', { to }), (r) => r.events.map(islandLine).filter(Boolean) as string[]),
    fight: (action) => run(() => api<FightResponse>('POST', '/island/fight', { action }), (r) => r.events.map((e) => fightLine(e, r)).filter(Boolean) as string[]),
    advanceNight: async () => {
      await run(
        () => api<IslandView & { sailed: boolean }>('POST', '/crew/advance-night'),
        (r) => [r.sailed ? `The ship sailed to a new ${r.island.theme} island.` : 'Night passed. New items washed ashore.'],
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
      return `Moved (−${e.cost} Moves)`;
    case 'found':
      return `Found ${e.item}.`;
    case 'hazard':
      return `The ${e.terrain} hurt you (−${e.damage} HP)`;
    case 'washed_overboard':
      return 'Washed overboard. Rest up, you are back tomorrow.';
    case 'boss_in_sight':
      return 'The guardian is within reach.';
    case 'revealed':
      return null;
  }
}

function fightLine(e: FightResponse['events'][number], r: FightResponse): string | null {
  const boss = r.boss.name;
  switch (e.type) {
    case 'hit':
      return `${e.weapon === 'cannon' ? 'Cannon hit.' : e.crit ? 'Critical strike.' : 'Strike.'} ${e.damage} damage to ${boss}`;
    case 'heal':
      return `Healed ${e.amount} HP`;
    case 'brace':
      return 'You brace yourself';
    case 'boss_hit':
      return `${e.enraged ? 'Enraged: ' : ''}${boss} hits you for ${e.damage}${e.braced ? ' (braced)' : ''}`;
    case 'enraged':
      return `${boss} is enraged.`;
    case 'washed_overboard':
      return `${boss} knocked you overboard.`;
    case 'boss_defeated':
      return `${boss} is defeated. The island is yours!`;
  }
}
