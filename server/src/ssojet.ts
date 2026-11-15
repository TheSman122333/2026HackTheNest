import { createRemoteJWKSet, customFetch, jwtVerify, type JWTPayload } from 'jose';

export class SsojetUnavailableError extends Error {}
export class SsojetAuthenticationError extends Error {}
export class SsojetRequestError extends Error {}

type SsojetInput = {
  authorizationCode: string;
  codeVerifier: string;
  redirectUri: string;
};

type OidcDiscovery = {
  issuer: string;
  jwks_uri: string;
  token_endpoint: string;
};

function httpsUrl(value: unknown): URL {
  if (typeof value !== 'string') throw new SsojetUnavailableError('invalid SSOJet configuration');
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new SsojetUnavailableError('SSOJet endpoints must use HTTPS');
  return url;
}

export async function exchangeSsojetCode(
  input: SsojetInput,
  env: NodeJS.ProcessEnv,
  fetchImpl: typeof fetch,
): Promise<{ sub: string; name: string | null }> {
  const issuer = env.SSOJET_ISSUER;
  const clientId = env.SSOJET_CLIENT_ID;
  const clientSecret = env.SSOJET_CLIENT_SECRET;
  const audience = env.SSOJET_AUDIENCE;
  // Comma-separated allowlist: e.g. the Android bridge (http://localhost:8787/auth/ssojet/callback)
  // and the website callback (https://<site>/auth/callback). The client says which one it used.
  const allowed = (env.SSOJET_REDIRECT_URI ?? '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!issuer || !clientId || !clientSecret || !audience || !allowed.length) {
    throw new SsojetUnavailableError('SSOJet sign-in is not configured');
  }
  if (!allowed.includes(input.redirectUri)) throw new SsojetRequestError('redirect URI mismatch');
  const redirectUri = input.redirectUri;

  const issuerUrl = httpsUrl(issuer);
  if (issuerUrl.search || issuerUrl.hash) throw new SsojetUnavailableError('invalid SSOJet issuer configuration');
  const discoveryUrl = new URL(`${issuerUrl.pathname.replace(/\/+$/, '')}/.well-known/openid-configuration`, issuerUrl.origin);
  const discoveryRes = await fetchImpl(discoveryUrl, { signal: AbortSignal.timeout(12_000) });
  if (!discoveryRes.ok) throw new SsojetUnavailableError('SSOJet discovery request failed');
  const discovery = (await discoveryRes.json()) as OidcDiscovery;
  if (discovery.issuer !== issuer) throw new SsojetUnavailableError('SSOJet issuer mismatch');
  const tokenUrl = httpsUrl(discovery.token_endpoint);
  const jwksUrl = httpsUrl(discovery.jwks_uri);

  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code: input.authorizationCode,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
    code_verifier: input.codeVerifier,
  });
  const tokenRes = await fetchImpl(tokenUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: form,
    signal: AbortSignal.timeout(12_000),
  });
  if (!tokenRes.ok) throw new SsojetUnavailableError('SSOJet authorization-code exchange failed');
  const tokenBody = (await tokenRes.json()) as { id_token?: unknown };
  if (typeof tokenBody.id_token !== 'string') throw new SsojetUnavailableError('SSOJet did not return an ID token');

  const jwks = createRemoteJWKSet(jwksUrl, { [customFetch]: fetchImpl });
  let payload: JWTPayload;
  try {
    ({ payload } = await jwtVerify(tokenBody.id_token, jwks, {
      issuer,
      audience,
      algorithms: ['RS256', 'ES256'],
    }));
  } catch {
    throw new SsojetAuthenticationError('SSOJet ID token verification failed');
  }
  if (typeof payload.sub !== 'string' || payload.sub.length < 1 || payload.sub.length > 255) {
    throw new SsojetAuthenticationError('SSOJet ID token has no valid subject');
  }
  const name = typeof payload.name === 'string' ? payload.name.trim().slice(0, 32) : null;
  return { sub: payload.sub, name: name || null };
}
