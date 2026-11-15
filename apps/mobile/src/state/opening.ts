import { create } from 'zustand';

type OpeningState = {
  visible: boolean;
  mode: 'storm' | 'reveal' | null;
  identity: string | null;
  start: (mode: 'storm' | 'reveal', identity: string) => void;
  finish: () => void;
  deferCallback: () => void;
};

/** Starts covered, so a cold launch never flashes the underlying sign-in screen. */
export const useOpening = create<OpeningState>((set, get) => ({
  visible: true, mode: null, identity: null,
  start: (mode, identity) => {
    if (get().identity === identity) return;
    set({ mode, identity, visible: true });
  },
  finish: () => set({ visible: false, mode: null }),
  deferCallback: () => set({ visible: false, mode: null }),
}));
