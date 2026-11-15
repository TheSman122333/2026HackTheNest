import { create } from 'zustand';

import { readPhoto, writePhoto } from '@/features/avatar/photoStorage';

export type FacePhoto = {
  uri: string;
  width: number;
  height: number;
  zoom: number;
  offsetX: number;
  offsetY: number;
};

type AvatarPhotoState = {
  userId: string | null;
  photo: FacePhoto | null;
  ready: boolean;
  error: string | null;
  hydrate: (userId: string) => Promise<void>;
  save: (userId: string, photo: FacePhoto | null) => Promise<FacePhoto | null>;
};

let generation = 0;
let hydration: { userId: string; promise: Promise<void> } | null = null;

/** Portrait bytes stay on this device; only the chosen illustrated avatar goes to the API. */
export const useAvatarPhoto = create<AvatarPhotoState>((set, get) => ({
  userId: null, photo: null, ready: false, error: null,
  hydrate: async (userId) => {
    if (get().userId === userId && get().ready) return;
    if (hydration?.userId === userId) return hydration.promise;
    const version = ++generation;
    set({ userId, photo: null, ready: false, error: null });
    const promise = (async () => {
      try {
        const photo = await readPhoto(userId);
        if (version === generation) set({ photo, ready: true });
      } catch {
        if (version === generation) set({ photo: null, ready: true, error: 'Could not read your saved photo on this device.' });
      }
    })().finally(() => { if (hydration?.promise === promise) hydration = null; });
    hydration = { userId, promise };
    return promise;
  },
  save: async (userId, photo) => {
    const saved = await writePhoto(userId, photo);
    if (get().userId === userId) {
      ++generation;
      if (hydration?.userId === userId) hydration = null;
      set({ photo: saved, ready: true, error: null });
    }
    return saved;
  },
}));
