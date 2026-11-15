/**
 * SSOJet sign-in (OIDC authorization code + PKCE). The app only gets a one-time code; the
 * server exchanges it with the client secret, verifies the ID token and mints our own JWT.
 *
 * Robust to "the login finished in a different tab/app" (e.g. an emailed magic link): the PKCE
 * verifier + state are saved on the device before leaving, and whoever receives the callback
 * (the app's /auth/callback route, or the auth-session result) completes it. First one wins.
 *
 * Redirect URIs (both must be listed in SSOJet "Sign-in callback URLs"):
 *  - web:     https://<site>/auth/callback                      (normal https page)
 *  - android: <API>/auth/ssojet/callback → lastvoyage://auth/callback (server bridge page)
 * Public config (not secrets): EXPO_PUBLIC_SSOJET_ISSUER, EXPO_PUBLIC_SSOJET_CLIENT_ID.
 */
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';

import { api, API_BASE, setToken, storage } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

const ISSUER = process.env.EXPO_PUBLIC_SSOJET_ISSUER;
const CLIENT_ID = process.env.EXPO_PUBLIC_SSOJET_CLIENT_ID;
const APP_RETURN = 'lastvoyage://auth/callback';
const PENDING_KEY = 'lv_ssojet_pending';
const PENDING_TTL_MS = 30 * 60_000;

export const ssojetConfigured = Boolean(ISSUER && CLIENT_ID);

/**
 * Web callbacks can go through one address SSOJet already trusts (EXPO_PUBLIC_SSOJET_WEB_CALLBACK_ORIGIN).
 * That page relays code + state back to the site where sign-in started (EXPO_PUBLIC_APP_URL),
 * which holds the PKCE verifier and finishes it. Lets new domains work without SSOJet changes.
 */
const WEB_CALLBACK_ORIGIN = process.env.EXPO_PUBLIC_SSOJET_WEB_CALLBACK_ORIGIN;
const APP_URL = process.env.EXPO_PUBLIC_APP_URL;

function redirectUri(): string {
  if (Platform.OS === 'web') return `${WEB_CALLBACK_ORIGIN || globalThis.location.origin}/auth/callback`;
  return `${API_BASE}/auth/ssojet/callback`;
}

/**
 * On the relay origin with no sign-in of its own in progress: send the callback on to the site
 * that started it. Only ever to our fixed APP_URL, never to an address taken from the request.
 */
export async function relayWebCallback(search: string): Promise<boolean> {
  if (Platform.OS !== 'web') return false;
  if (await storage.get(PENDING_KEY)) return false; // sign-in started on this origin: finish it here
  // The state ends with "~<n>": index of the site that started sign-in, in a FIXED list.
  const state = new URLSearchParams(search).get('state') ?? '';
  const index = Number(state.split('~')[1]);
  const target = Number.isInteger(index) ? SITES[index] : APP_URL;
  if (!target) return false;
  const origin = new URL(target).origin;
  if (globalThis.location.origin === origin) return false;
  globalThis.location.replace(`${origin}/auth/callback${search}`);
  return true;
}

/** Our own sites a web sign-in may return to (never taken from the request). */
const SITES = ['https://lastvoyageplease.work', 'https://play.lastvoyageplease.work', 'https://last-voyage-kohl.vercel.app'];
function siteTag(): string {
  const i = SITES.findIndex((s) => Platform.OS === 'web' && new URL(s).origin === globalThis.location?.origin);
  return i >= 0 ? `~${i}` : '';
}

type Pending = { state: string; verifier: string; redirectUri: string; at: number };

/**
 * Starts sign-in. Web: navigates this tab to SSOJet (the /auth/callback page finishes it).
 * Native: opens the browser; returns true if signed in, false if cancelled / finished elsewhere.
 */
export async function signInWithSsojet(): Promise<boolean> {
  if (!ISSUER || !CLIENT_ID) throw new Error('SSOJet is not configured in this build');
  // PKCE needs the browser's Web Crypto, which only exists on https:// (or localhost). On a plain
  // http:// page, hop to the real HTTPS site instead of failing with a cryptic crypto error.
  if (Platform.OS === 'web' && globalThis.isSecureContext === false) {
    const site = process.env.EXPO_PUBLIC_APP_URL || `https://${globalThis.location.host}`;
    globalThis.location.replace(`${site}/welcome`);
    return new Promise<boolean>(() => {});
  }
  const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri: redirectUri(),
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
    // Random state, tagged with which of our sites started sign-in (for the callback relay).
    state: `${Crypto.randomUUID().replace(/-/g, "")}${siteTag()}`,
  });
  const authUrl = await request.makeAuthUrlAsync(discovery);
  const pending: Pending = { state: request.state, verifier: request.codeVerifier!, redirectUri: redirectUri(), at: Date.now() };
  await storage.set(PENDING_KEY, JSON.stringify(pending));

  if (Platform.OS === 'web') {
    globalThis.location.assign(authUrl);
    return new Promise<boolean>(() => {}); // page is navigating away
  }
  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN);
  if (result.type !== 'success') return false;
  const p = new URL(result.url).searchParams;
  return completeSsojet({ code: p.get('code'), state: p.get('state'), error: p.get('error') });
}

/** Finish a sign-in from callback params. Returns true when a new session token was saved. */
export async function completeSsojet(params: { code?: string | null; state?: string | null; error?: string | null }): Promise<boolean> {
  if (params.error) throw new Error(`SSOJet: ${params.error}`);
  if (!params.code || !params.state) return false;
  const raw = await storage.get(PENDING_KEY);
  if (!raw) return false; // already completed by the other path
  const pending = JSON.parse(raw) as Pending;
  if (pending.state !== params.state) throw new Error('This sign-in link is from an older attempt. Please try again.');
  if (Date.now() - pending.at > PENDING_TTL_MS) throw new Error('Sign-in took too long. Please try again.');
  await storage.del(PENDING_KEY); // consume once: the other path becomes a no-op
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const r = await api<{ token: string }>('POST', '/auth/ssojet', {
    authorizationCode: params.code,
    codeVerifier: pending.verifier,
    redirectUri: pending.redirectUri,
    tz,
  });
  await setToken(r.token);
  return true;
}
