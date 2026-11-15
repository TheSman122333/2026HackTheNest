/** Session + "me" state. One store, refreshed after every action that changes the server. */
import { create } from 'zustand';

import { signInWithSsojet } from '@/features/auth/ssojet';
import { api, devLogin, loadToken, setToken } from '@/lib/api';
import type { Me } from '@/lib/types';

type Session = {
  ready: boolean;
  token: string | null;
  me: Me | null;
  error: string | null;
  boot: () => Promise<void>;
  refresh: () => Promise<Me | null>;
  login: (name: string) => Promise<void>;
  ssoLogin: () => Promise<boolean>;
  logout: () => Promise<void>;
  setMe: (me: Partial<Me>) => void;
};

let identityRevision = 0;

export const useSession = create<Session>((set, get) => ({
  ready: false,
  token: null,
  me: null,
  error: null,

  boot: async () => {
    const revision = ++identityRevision;
    const token = await loadToken();
    if (revision !== identityRevision) return;
    set({ token, me: null, error: null });
    if (token) await get().refresh();
    if (revision === identityRevision) set({ ready: true });
  },

  refresh: async () => {
    const revision = identityRevision;
    const requestToken = get().token;
    if (!requestToken) return null;
    const current = () => revision === identityRevision && get().token === requestToken;
    try {
      const me = await api<Me>('GET', '/me');
      if (!current()) return null;
      set({ me, error: null });
      return me;
    } catch (e) {
      if (!current()) return null;
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'unauthorized') {
        await setToken(null);
        if (!current()) return null;
        set({ token: null, me: null });
      }
      set({ error: msg });
      return null;
    }
  },

  login: async (name) => {
    const revision = ++identityRevision;
    await devLogin(name);
    const token = await loadToken();
    if (revision !== identityRevision) return;
    set({ token, me: null, error: null });
    await get().refresh();
  },

  ssoLogin: async () => {
    const revision = ++identityRevision;
    const ok = await signInWithSsojet();
    if (!ok || revision !== identityRevision) return false;
    const token = await loadToken();
    if (revision !== identityRevision) return false;
    set({ token, me: null, error: null });
    await get().refresh();
    return true;
  },

  logout: async () => {
    const revision = ++identityRevision;
    await setToken(null);
    if (revision === identityRevision) set({ token: null, me: null });
  },

  setMe: (patch) => {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
}));
