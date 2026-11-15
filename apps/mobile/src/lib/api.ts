/**
 * Tiny typed client for server/. Dev: run `npm run server` + `adb reverse tcp:8787 tcp:8787`.
 * Override with EXPO_PUBLIC_API_URL (e.g. the deployed URL).
 */
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { getRequestLanguage } from '@/features/language/requestLanguage';

// Web build: talk to the API on the same host that served the page (works over LAN/hotspot).
const BASE =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'web' && globalThis.location ? `${globalThis.location.protocol}//${globalThis.location.hostname}:8787` : 'http://localhost:8787');
const TOKEN_KEY = 'lv_token';

let token: string | null = null;

/** SecureStore on phones; the browser (iPhone Safari build) uses localStorage. */
export const storage = {
  get: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.getItem(k) ?? null : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string) => (Platform.OS === 'web' ? globalThis.localStorage?.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string) => (Platform.OS === 'web' ? globalThis.localStorage?.removeItem(k) : SecureStore.deleteItemAsync(k)),
};

export async function loadToken(): Promise<string | null> {
  token ??= await storage.get(TOKEN_KEY);
  return token;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await storage.set(TOKEN_KEY, t);
  else await storage.del(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown, options?: { signal?: AbortSignal }): Promise<T> {
  const language = getRequestLanguage();
  const t = await loadToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    // Platform decides the quest rules: Android tracks steps/scrolling, iPhone/web get extra quests.
    headers: { 'content-type': 'application/json', 'X-App-Language': language, 'x-lv-platform': Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: options?.signal,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? res.statusText);
  return json as T;
}

export async function devLogin(name: string) {
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const r = await api<{ token: string; user: unknown }>('POST', '/auth/dev', { name, tz });
  await setToken(r.token);
  return r.user;
}

export const API_BASE = BASE;

/** Absolute URL + auth header for server-proxied media (e.g. narrator audio). */
export async function authedSource(path: string) {
  const t = await loadToken();
  return { uri: `${BASE}${path}`, headers: t ? { authorization: `Bearer ${t}` } : undefined };
}

/** Random v4 UUID (server requires uuid requestIds). */
export function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
