import { create } from 'zustand';

import { storage } from '@/lib/api';

const KEY = 'lv_pending_crew_invite_v1';
const TTL = 7 * 24 * 60 * 60_000;

export function inviteCode(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const code = value.trim().toUpperCase();
  return /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(code) ? code : null;
}

type PendingInvite = {
  ready: boolean;
  code: string | null;
  hydrate: () => Promise<void>;
  remember: (code: string) => Promise<void>;
  clear: () => Promise<void>;
};
let hydration: Promise<void> | null = null;
let revision = 0;
let writes: Promise<void> = Promise.resolve();
const writeInOrder = (operation: () => Promise<unknown>) => {
  const pending = writes.catch(() => {}).then(operation).then(() => {});
  writes = pending;
  return pending;
};

/** A crew code survives the SSOJet redirect independently of its OAuth state and verifier. */
export const usePendingInvite = create<PendingInvite>((set, get) => ({
  ready: false, code: null,
  hydrate: async () => {
    if (get().ready) return;
    if (hydration) return hydration;
    const current = revision;
    const promise = (async () => {
      let code: string | null = null;
      try {
        const raw = await storage.get(KEY);
        const value = raw ? JSON.parse(raw) as { code?: unknown; at?: unknown } : null;
        if (value && typeof value.at === 'number' && Date.now() - value.at < TTL && value.at <= Date.now()) code = inviteCode(value.code);
      } catch { /* A bad/expired invite never prevents normal sign-in. */ }
      if (current === revision) set({ ready: true, code });
    })().finally(() => { if (hydration === promise) hydration = null; });
    hydration = promise;
    return promise;
  },
  remember: async (value) => {
    const code = inviteCode(value);
    if (!code) throw new Error('Use the six-character invite code from your friend.');
    const current = ++revision;
    // Persist before leaving for SSOJet; if storage is blocked, keep the invite screen open.
    await writeInOrder(() => storage.set(KEY, JSON.stringify({ code, at: Date.now() })));
    if (current === revision) set({ ready: true, code });
  },
  clear: async () => {
    const current = ++revision;
    await writeInOrder(() => storage.del(KEY));
    if (current === revision) set({ ready: true, code: null });
  },
}));
