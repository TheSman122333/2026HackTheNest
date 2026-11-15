import { create } from 'zustand';

import { readPhoto, writePhoto, releasePhoto } from '@/features/avatar/photoStorage';
import { api } from '@/lib/api';

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
  invalidate: () => void;
};

let generation = 0;
let hydration: { userId: string; promise: Promise<void> } | null = null;

/** MongoDB is authoritative; a per-account device copy supports offline display. */
export const useAvatarPhoto = create<AvatarPhotoState>((set, get) => ({
  userId: null, photo: null, ready: false, error: null,
  invalidate: () => { ++generation; hydration = null; set({ userId: null, photo: null, ready: false, error: null }); },
  hydrate: async (userId) => {
    if (get().userId === userId && get().ready) return;
    if (hydration?.userId === userId) return hydration.promise;
    const version = ++generation;
    set({ userId, photo: null, ready: false, error: null });
    const promise = (async () => {
      try {
        const previous = await readPhoto(userId).catch(() => null);
        let photo = previous;
        try {
          const remote = await api<{ photo: FacePhoto | null; configured?: boolean }>('GET', '/me/avatar/photo');
          if (version !== generation) return;
          if (remote.photo || remote.configured) {
            photo = remote.photo;
            try {
              photo = await writePhoto(userId, photo);
              await releasePhoto(userId, previous, photo?.uri);
            } catch { /* The cloud portrait can still render when device caching is unavailable. */ }
          }
        } catch {
          if (version === generation) set({ error: 'Photo sync is unavailable. Your saved device photo is shown.' });
        }
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
