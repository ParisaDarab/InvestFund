/**
 * The OAuth `state` round trip, kept in a short-lived, signed, httpOnly cookie scoped to the
 * callback path: no server-side storage, and a callback without the matching cookie (CSRF,
 * replay from another browser) is rejected.
 */
import { randomBytes, timingSafeEqual } from 'node:crypto';

import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

export const OAUTH_STATE_COOKIE = 'if_oauth';
export const OAUTH_STATE_TTL_SECONDS = 600;

const StatePayload = z.object({
  state: z.string().min(16),
  verifier: z.string().min(43),
  returnTo: z.string().nullable(),
});
export type OAuthState = z.infer<typeof StatePayload>;

export class OAuthStateCodec {
  readonly #key: Uint8Array;

  constructor(secret: string) {
    this.#key = new TextEncoder().encode(`oauth-state:${secret}`);
  }

  static newState(): string {
    return randomBytes(24).toString('base64url');
  }

  async encode(payload: OAuthState): Promise<string> {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${String(OAUTH_STATE_TTL_SECONDS)}s`)
      .sign(this.#key);
  }

  /** Returns the payload when the cookie is valid and its state equals `state`. */
  async decode(cookie: string | undefined, state: string | undefined): Promise<OAuthState | null> {
    if (cookie === undefined || state === undefined) return null;
    try {
      const { payload } = await jwtVerify(cookie, this.#key, { algorithms: ['HS256'] });
      const parsed = StatePayload.safeParse(payload);
      if (!parsed.success) return null;
      const expected = Buffer.from(parsed.data.state);
      const actual = Buffer.from(state);
      if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }
}
