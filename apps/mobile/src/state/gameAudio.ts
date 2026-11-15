import { Platform } from 'react-native';
import { create } from 'zustand';

import { storage } from '@/lib/api';

export type GameSound = 'move' | 'strike' | 'cannon' | 'heal' | 'brace';
export type AudioReadiness = 'idle' | 'loading' | 'ready' | 'unavailable';
const KEY = 'lv_game_audio_v1';
const effects = new Set<(sound: GameSound) => void>();
const unlockers = new Set<() => void>();
let revision = 0;
let hydration: Promise<void> | null = null;
let persistence: Promise<void> = Promise.resolve();

type GameAudio = {
  hydrated: boolean;
  musicEnabled: boolean;
  effectsEnabled: boolean;
  unlocked: boolean;
  previewPlaying: boolean;
  musicStatus: AudioReadiness;
  effectsStatus: AudioReadiness;
  retryNonce: number;
  hydrate: () => Promise<void>;
  toggleMusic: () => void;
  toggleEffects: () => void;
  retry: () => void;
  unlock: () => void;
};
const persist = (musicEnabled: boolean, effectsEnabled: boolean) => {
  const value = JSON.stringify({ musicEnabled, effectsEnabled });
  persistence = persistence.catch(() => {}).then(async () => { await storage.set(KEY, value); }).catch(() => {});
};

export const useGameAudio = create<GameAudio>((set, get) => ({
  hydrated: false, musicEnabled: true, effectsEnabled: true,
  unlocked: Platform.OS !== 'web', previewPlaying: false,
  musicStatus: 'idle', effectsStatus: 'idle', retryNonce: 0,
  hydrate: async () => {
    if (get().hydrated) return;
    if (hydration) return hydration;
    const version = revision;
    const promise = (async () => {
      try {
        const saved = JSON.parse(await storage.get(KEY) ?? '{}') as Record<string, unknown>;
        if (version === revision) set({
          musicEnabled: typeof saved.musicEnabled === 'boolean' ? saved.musicEnabled : true,
          effectsEnabled: typeof saved.effectsEnabled === 'boolean' ? saved.effectsEnabled : true,
        });
      } catch { /* Optional audio never blocks the voyage. */ }
      set({ hydrated: true });
    })().finally(() => { hydration = null; });
    hydration = promise;
    return promise;
  },
  toggleMusic: () => {
    ++revision;
    const musicEnabled = !get().musicEnabled;
    set({ musicEnabled });
    persist(musicEnabled, get().effectsEnabled);
    get().unlock();
  },
  toggleEffects: () => {
    ++revision;
    const effectsEnabled = !get().effectsEnabled;
    set({ effectsEnabled });
    persist(get().musicEnabled, effectsEnabled);
    get().unlock();
  },
  retry: () => { set({ retryNonce: get().retryNonce + 1 }); get().unlock(); },
  unlock: () => {
    if (!get().unlocked) set({ unlocked: true });
    for (const unlock of unlockers) { try { unlock(); } catch { /* Audio must not intercept a game button. */ } }
  },
}));

/** No queue: a sound that is not ready is dropped rather than playing after its animation. */
export function playGameSound(sound: GameSound) {
  if (!useGameAudio.getState().effectsEnabled) return;
  for (const play of effects) { try { play(sound); } catch { /* Keep the game playable without audio. */ } }
}
export function listenForGameSounds(play: (sound: GameSound) => void) {
  effects.add(play);
  return () => { effects.delete(play); };
}
export function listenForAudioUnlock(unlock: () => void) {
  unlockers.add(unlock);
  return () => { unlockers.delete(unlock); };
}
