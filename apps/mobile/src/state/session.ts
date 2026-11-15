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

export const useSession = create<Session>((set, get) => ({
  ready: false,
  token: null,
  me: null,
  error: null,

  boot: async () => {
    const token = await loadToken();
    set({ token });
    if (token) await get().refresh();
    set({ ready: true });
  },

  refresh: async () => {
    try {
      const me = await api<Me>('GET', '/me');
      set({ me, error: null });
      return me;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg === 'unauthorized') {
        await setToken(null);
        set({ token: null, me: null });
      }
      set({ error: msg });
      return null;
    }
  },

  login: async (name) => {
    await devLogin(name);
    set({ token: await loadToken() });
    await get().refresh();
  },

  ssoLogin: async () => {
    const ok = await signInWithSsojet();
    if (!ok) return false;
    set({ token: await loadToken() });
    await get().refresh();
    return true;
  },

  logout: async () => {
    await setToken(null);
    set({ token: null, me: null });
  },

  setMe: (patch) => {
    const me = get().me;
    if (me) set({ me: { ...me, ...patch } });
  },
}));
