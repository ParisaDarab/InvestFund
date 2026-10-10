/**
 * Google OAuth 2.0 authorization-code flow with PKCE (RFC 7636), server side.
 *
 * - The browser is sent to Google's consent endpoint with `state` and an S256 code challenge.
 * - The callback exchanges the code at the token endpoint over a back channel, authenticated
 *   with the client secret and the PKCE verifier, and reads the identity from the OpenID
 *   `userinfo` endpoint with the access token it just received. The identity therefore comes
 *   straight from Google over TLS, never from the browser.
 * - Only `openid email profile` scopes are requested. Google tokens are discarded after sign-in:
 *   the platform needs no ongoing Google access.
 *
 * Base URLs are configurable so CI and local development run the same code against
 * `infra/mocks/google` (ADR 0002 §Testing).
 */
import { createHash, randomBytes } from 'node:crypto';

import { z } from 'zod';

import type { GoogleConfig } from '../../core/config/config.js';

export const GOOGLE_SCOPES = ['openid', 'email', 'profile'] as const;

/** The verified identity returned by the provider. */
export interface ExternalIdentity {
  readonly sub: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly name: string;
  readonly picture: string | null;
}

export interface AuthorizationRequest {
  readonly state: string;
  readonly codeChallenge: string;
  readonly loginHint?: string | undefined;
}

export interface IdentityProvider {
  authorizationUrl(request: AuthorizationRequest): string;
  /** Exchanges the code; rejects with `IdentityProviderError` on any failure. */
  exchange(code: string, codeVerifier: string): Promise<ExternalIdentity>;
}

export class IdentityProviderError extends Error {
  override readonly name = 'IdentityProviderError';
}

/** A random PKCE verifier (43 chars, base64url) and its S256 challenge. */
export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

const TokenResponse = z.object({ access_token: z.string().min(1), token_type: z.string() });
const UserInfo = z.object({
  sub: z.string().min(1).max(255),
  email: z.email(),
  email_verified: z.boolean(),
  name: z.string().max(200).optional(),
  given_name: z.string().optional(),
  picture: z.url().optional(),
});

const TIMEOUT_MS = 10_000;

export class GoogleOAuthProvider implements IdentityProvider {
  constructor(
    private readonly config: GoogleConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  authorizationUrl({ state, codeChallenge, loginHint }: AuthorizationRequest): string {
    const url = new URL(`${this.config.authBaseUrl}/o/oauth2/v2/auth`);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', GOOGLE_SCOPES.join(' '));
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', codeChallenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('prompt', 'select_account');
    if (loginHint !== undefined) url.searchParams.set('login_hint', loginHint);
    return url.toString();
  }

  async exchange(code: string, codeVerifier: string): Promise<ExternalIdentity> {
    const tokenResponse = await this.request(`${this.config.oauth2BaseUrl}/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        code_verifier: codeVerifier,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      }).toString(),
    });
    const token = TokenResponse.safeParse(tokenResponse);
    if (!token.success) throw new IdentityProviderError('Unexpected token response');

    const info = UserInfo.safeParse(
      await this.request(`${this.config.apiBaseUrl}/oauth2/v3/userinfo`, {
        headers: { Authorization: `Bearer ${token.data.access_token}` },
      }),
    );
    if (!info.success) throw new IdentityProviderError('Unexpected userinfo response');
    const {
      sub,
      email,
      email_verified: emailVerified,
      name,
      given_name: given,
      picture,
    } = info.data;
    return {
      sub,
      email: email.toLowerCase(),
      emailVerified,
      name: (name ?? given ?? email.split('@')[0] ?? 'User').slice(0, 120),
      picture: picture ?? null,
    };
  }

  private async request(url: string, init: RequestInit): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (cause) {
      throw new IdentityProviderError('Identity provider unreachable', { cause });
    }
    if (!response.ok) {
      // The body may echo the code; never include it.
      throw new IdentityProviderError(`Identity provider answered ${String(response.status)}`);
    }
    try {
      return await response.json();
    } catch (cause) {
      throw new IdentityProviderError('Identity provider returned invalid JSON', { cause });
    }
  }
}
