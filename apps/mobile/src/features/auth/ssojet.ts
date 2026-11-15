/**
 * SSOJet sign-in (OIDC authorization code + PKCE). The app only gets a one-time code; the
 * server exchanges it with the client secret, verifies the ID token and mints our own JWT.
 *
 * SSOJet only allows http(s) callbacks, so the redirect URI is our server's bridge page
 * (GET /auth/ssojet/callback), which bounces the code into lastvoyage://auth/callback.
 * Public config (not secrets): EXPO_PUBLIC_SSOJET_ISSUER, EXPO_PUBLIC_SSOJET_CLIENT_ID.
 */
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';

import { api, API_BASE, setToken } from '@/lib/api';

WebBrowser.maybeCompleteAuthSession();

const ISSUER = process.env.EXPO_PUBLIC_SSOJET_ISSUER;
const CLIENT_ID = process.env.EXPO_PUBLIC_SSOJET_CLIENT_ID;
const APP_RETURN = 'lastvoyage://auth/callback';

export const ssojetConfigured = Boolean(ISSUER && CLIENT_ID);
/** must match SSOJet's "Sign-in callback URLs" and the server's SSOJET_REDIRECT_URI */
export const SSOJET_REDIRECT = `${API_BASE}/auth/ssojet/callback`;

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
  const authUrl = await request.makeAuthUrlAsync(discovery);
  const result = await WebBrowser.openAuthSessionAsync(authUrl, APP_RETURN);
  if (result.type !== 'success') return false;

  const params = new URL(result.url).searchParams;
  if (params.get('error')) throw new Error(`SSOJet: ${params.get('error')}`);
  const code = params.get('code');
  if (!code) throw new Error('SSOJet returned no code');
  if (params.get('state') !== request.state) throw new Error('sign-in state mismatch, please try again');

  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  const r = await api<{ token: string }>('POST', '/auth/ssojet', {
    authorizationCode: code,
    codeVerifier: request.codeVerifier,
    redirectUri: SSOJET_REDIRECT,
    tz,
  });
  await setToken(r.token);
  return true;
}
