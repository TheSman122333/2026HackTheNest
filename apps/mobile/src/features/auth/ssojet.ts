/**
 * SSOJet sign-in (OIDC authorization code + PKCE). The app only gets a one-time code; the
 * server exchanges it with the client secret, verifies the ID token and mints our own JWT.
 * Public config (not secrets): EXPO_PUBLIC_SSOJET_ISSUER, EXPO_PUBLIC_SSOJET_CLIENT_ID.
 */
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { api, setToken } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

const ISSUER = process.env.EXPO_PUBLIC_SSOJET_ISSUER;
const CLIENT_ID = process.env.EXPO_PUBLIC_SSOJET_CLIENT_ID;

export const ssojetConfigured = Boolean(ISSUER && CLIENT_ID);
export const SSOJET_REDIRECT = AuthSession.makeRedirectUri({ scheme: 'lastvoyage', path: 'auth/callback' });

/** Returns true when signed in, false if the user cancelled. Throws on real errors. */
export async function signInWithSsojet(): Promise<boolean> {
  if (!ISSUER || !CLIENT_ID) throw new Error('SSOJet is not configured in this build');
  const discovery = await AuthSession.fetchDiscoveryAsync(ISSUER);
  const request = new AuthSession.AuthRequest({
    clientId: CLIENT_ID,
    redirectUri: SSOJET_REDIRECT,
    scopes: ['openid', 'profile', 'email'],
    responseType: AuthSession.ResponseType.Code,
    usePKCE: true,
  });
  const result = await request.promptAsync(discovery);
  if (result.type === 'cancel' || result.type === 'dismiss') return false;
  if (result.type !== 'success' || !result.params.code) {
    throw new Error(result.type === 'error' ? (result.error?.message ?? 'sign-in failed') : 'sign-in failed');
  }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const r = await api<{ token: string }>('POST', '/auth/ssojet', {
    authorizationCode: result.params.code,
    codeVerifier: request.codeVerifier,
    redirectUri: SSOJET_REDIRECT,
    tz,
  });
  await setToken(r.token);
  return true;
}
