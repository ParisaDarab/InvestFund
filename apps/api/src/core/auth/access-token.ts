/**
 * Access-token verification (HS256 JWT signed with `JWT_ACCESS_SECRET`). Issuance comes with the
 * login endpoints in P1, which must sign with the same algorithm, issuer and audience.
 *
 * Accepted only when: the header algorithm is HS256 (no `none`, no algorithm confusion), the
 * signature verifies, `iss`/`aud` match, `exp` is present and in the future (small clock skew
 * allowed), and the claims parse as `{ sub: UUID, role: UserRole }`. Any failure is reported as
 * one generic error; the token itself is never logged or echoed.
 */
import { SignJWT, errors as joseErrors, jwtVerify } from 'jose';
import { z } from 'zod';

import { USER_ROLES } from '@investfund/shared';

import type { AuthUser } from './auth.types.js';

export const ACCESS_TOKEN_ALGORITHM = 'HS256';
export const ACCESS_TOKEN_ISSUER = 'investfund-api';
export const ACCESS_TOKEN_AUDIENCE = 'investfund';
/** Allowed clock skew between the issuer and this process. */
export const ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS = 5;

const AccessTokenClaims = z.object({
  sub: z.uuid(),
  role: z.enum(USER_ROLES).nullable(),
});

/** Access-token lifetime: 15 minutes (ADR 0001). */
export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;

/** Signs access tokens with the same algorithm, issuer and audience the verifier expects. */
export class JwtAccessTokenIssuer {
  readonly #key: Uint8Array;

  constructor(
    secret: string,
    private readonly ttlSeconds = ACCESS_TOKEN_TTL_SECONDS,
  ) {
    if (secret.length === 0) throw new Error('JWT_ACCESS_SECRET must not be empty');
    this.#key = new TextEncoder().encode(secret);
  }

  get expiresIn(): number {
    return this.ttlSeconds;
  }

  async issue(user: AuthUser): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    return new SignJWT({ role: user.role })
      .setProtectedHeader({ alg: ACCESS_TOKEN_ALGORITHM, typ: 'JWT' })
      .setSubject(user.id)
      .setIssuer(ACCESS_TOKEN_ISSUER)
      .setAudience(ACCESS_TOKEN_AUDIENCE)
      .setIssuedAt(now)
      .setExpirationTime(now + this.ttlSeconds)
      .sign(this.#key);
  }
}

/** The token is missing a valid signature, has expired, or has unexpected claims. */
export class InvalidAccessTokenError extends Error {
  override readonly name = 'InvalidAccessTokenError';

  constructor(readonly reason: 'expired' | 'invalid') {
    super(reason === 'expired' ? 'Access token expired' : 'Access token invalid');
  }
}

export interface AccessTokenVerifier {
  /** Resolves with the caller or rejects with `InvalidAccessTokenError`. */
  verify(token: string): Promise<AuthUser>;
}

export class JwtAccessTokenVerifier implements AccessTokenVerifier {
  readonly #key: Uint8Array;

  constructor(secret: string) {
    if (secret.length === 0) throw new Error('JWT_ACCESS_SECRET must not be empty');
    this.#key = new TextEncoder().encode(secret);
  }

  async verify(token: string): Promise<AuthUser> {
    let payload: unknown;
    try {
      ({ payload } = await jwtVerify(token, this.#key, {
        algorithms: [ACCESS_TOKEN_ALGORITHM],
        issuer: ACCESS_TOKEN_ISSUER,
        audience: ACCESS_TOKEN_AUDIENCE,
        requiredClaims: ['exp', 'sub'],
        clockTolerance: ACCESS_TOKEN_CLOCK_TOLERANCE_SECONDS,
      }));
    } catch (error) {
      throw new InvalidAccessTokenError(
        error instanceof joseErrors.JWTExpired ? 'expired' : 'invalid',
      );
    }
    const claims = AccessTokenClaims.safeParse(payload);
    if (!claims.success) throw new InvalidAccessTokenError('invalid');
    return { id: claims.data.sub, role: claims.data.role };
  }
}
