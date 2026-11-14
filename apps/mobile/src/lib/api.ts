/**
 * Tiny typed client for server/. Dev: run `npm run server` + `adb reverse tcp:8787 tcp:8787`.
 * Override with EXPO_PUBLIC_API_URL (e.g. the deployed URL).
 */
import * as SecureStore from 'expo-secure-store';

const BASE = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';
const TOKEN_KEY = 'lv_token';

let token: string | null = null;

export async function loadToken(): Promise<string | null> {
  token ??= await SecureStore.getItemAsync(TOKEN_KEY);
  return token;
}

export async function setToken(t: string | null) {
  token = t;
  if (t) await SecureStore.setItemAsync(TOKEN_KEY, t);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T>(method: 'GET' | 'POST' | 'PUT', path: string, body?: unknown): Promise<T> {
  const t = await loadToken();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { 'content-type': 'application/json', ...(t ? { authorization: `Bearer ${t}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
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
