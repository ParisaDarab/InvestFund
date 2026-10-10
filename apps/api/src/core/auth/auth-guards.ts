/**
 * Route guards: `requireAuth()` and `requireRole(...roles)`.
 *
 * - No `Authorization: Bearer <token>` header → 401 `unauthenticated` (`WWW-Authenticate: Bearer`).
 * - Malformed, wrongly signed or expired token → 401 `unauthenticated`
 *   (`WWW-Authenticate: Bearer error="invalid_token"`).
 * - Valid token but the role is not allowed → 403 `forbidden`.
 *
 * `requireRole` authenticates by itself when no earlier guard did, so a route needs only one of
 * them. Ownership and visibility checks are not guards: services do them (P2, P4).
 */
import type { UserRole } from '@investfund/shared';

import { ForbiddenError, UnauthenticatedError } from '../errors/domain-errors.js';

import { InvalidAccessTokenError, type AccessTokenVerifier } from './access-token.js';

import type { AuthUser } from './auth.types.js';
import type { Request, RequestHandler } from 'express';

/** `Bearer` scheme (case-insensitive) followed by a JWS compact token. */
const BEARER = /^Bearer +([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i;

export class AuthGuards {
  constructor(private readonly verifier: AccessTokenVerifier) {}

  /** Verifies the access token and sets `req.user`. */
  requireAuth(): RequestHandler {
    return async (req, _res, next) => {
      await this.authenticate(req);
      next();
    };
  }

  /** `requireAuth()` plus a role check. */
  requireRole(...roles: [UserRole, ...UserRole[]]): RequestHandler {
    const allowed = new Set<UserRole>(roles);
    return async (req, _res, next) => {
      const user = await this.authenticate(req);
      if (!allowed.has(user.role)) throw new ForbiddenError();
      next();
    };
  }

  private async authenticate(req: Request): Promise<AuthUser> {
    if (req.user !== undefined) return req.user;
    const header = req.headers.authorization;
    if (header === undefined || header === '') throw new UnauthenticatedError();
    const token = BEARER.exec(header)?.[1];
    if (token === undefined) {
      throw new UnauthenticatedError('The access token is invalid.', { invalidToken: true });
    }
    try {
      req.user = await this.verifier.verify(token);
      return req.user;
    } catch (error) {
      if (error instanceof InvalidAccessTokenError) {
        throw new UnauthenticatedError(
          error.reason === 'expired'
            ? 'The access token has expired.'
            : 'The access token is invalid.',
          { invalidToken: true },
        );
      }
      throw error;
    }
  }
}
