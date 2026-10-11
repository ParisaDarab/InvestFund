/**
 * `/api/v1/auth`: Google sign-in, refresh and sign-out (docs/API.md §6.1).
 *
 * Browser flow: web → `GET /auth/google/start` → Google → `GET /auth/google/callback` → web
 * `/auth/complete` → `POST /auth/refresh` (cookie) → access token kept in memory.
 *
 * CSRF: the refresh cookie is `SameSite=Lax`, scoped to `/api/v1/auth`, and the cookie-using
 * POSTs require a JSON body (so a cross-site form cannot send them without a CORS preflight,
 * which only the web origin passes) plus, when present, an allowed `Origin`.
 */
import { Router, type Request, type Response } from 'express';

import { GoogleStartQuery, SessionResponse } from '@investfund/shared';

import {
  DependencyUnavailableError,
  ForbiddenError,
  UnauthenticatedError,
  ValidationError,
} from '../../core/errors/domain-errors.js';
import { validate } from '../../core/validation/validate.js';
import { currentUserInclude, toCurrentUser } from '../users/user.mapper.js';

import { AuthService } from './auth.service.js';
import { readCookie, serializeCookie } from './cookies.js';
import { createPkcePair, IdentityProviderError } from './google-provider.js';
import { OAUTH_STATE_COOKIE, OAUTH_STATE_TTL_SECONDS, OAuthStateCodec } from './oauth-state.js';

import type { ModuleContext } from '../context.js';

export const REFRESH_COOKIE = 'if_refresh';
const AUTH_COOKIE_PATH = '/api/v1/auth';
const CALLBACK_COOKIE_PATH = '/api/v1/auth/google';

/** `login_hint` is an email address; anything else is ignored. */
const LOGIN_HINT = /^[^\s@]{1,64}@[^\s@]{1,190}$/;

export function buildAuthRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const secure = ctx.config.isProduction;
  const stateCodec = new OAuthStateCodec(ctx.config.session.stateSecret);
  const service = new AuthService(ctx.prisma);
  const web = ctx.config.webOrigin;
  const limit = ctx.rateLimiter.limit('auth');
  // Refresh runs on every page load; tokens carry 256 bits of entropy, so the general limit fits.
  const sessionLimit = ctx.rateLimiter.limit('default');

  const redirectToWeb = (res: Response, path: string, params: Record<string, string> = {}) => {
    const url = new URL(path, web);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    res.redirect(303, url.toString());
  };

  const clearStateCookie = (res: Response) =>
    res.append(
      'Set-Cookie',
      serializeCookie(OAUTH_STATE_COOKIE, '', {
        path: CALLBACK_COOKIE_PATH,
        maxAgeSeconds: 0,
        secure,
        sameSite: 'Lax',
      }),
    );

  const setRefreshCookie = (res: Response, token: string, maxAgeSeconds: number) =>
    res.append(
      'Set-Cookie',
      serializeCookie(REFRESH_COOKIE, token, {
        path: AUTH_COOKIE_PATH,
        maxAgeSeconds,
        secure,
        sameSite: 'Lax',
      }),
    );

  const assertSameOriginPost = (req: Request) => {
    const origin = req.headers.origin;
    if (origin !== undefined && !ctx.config.security.corsOrigins.includes(origin)) {
      throw new ForbiddenError('Cross-origin request refused.');
    }
    if (!req.is('application/json')) {
      throw new ValidationError('Send a JSON body (`{}`).');
    }
  };

  router.get('/google/start', limit, validate({ query: GoogleStartQuery }), async (req, res) => {
    const provider = ctx.identityProvider;
    if (provider === null) {
      throw new DependencyUnavailableError('Google sign-in is not configured on this server.');
    }
    const query = req.query as GoogleStartQuery;
    const state = OAuthStateCodec.newState();
    const pkce = createPkcePair();
    const cookie = await stateCodec.encode({
      state,
      verifier: pkce.verifier,
      returnTo: query.returnTo ?? null,
    });
    res.append(
      'Set-Cookie',
      serializeCookie(OAUTH_STATE_COOKIE, cookie, {
        path: CALLBACK_COOKIE_PATH,
        maxAgeSeconds: OAUTH_STATE_TTL_SECONDS,
        secure,
        sameSite: 'Lax',
      }),
    );
    const hint = query.loginHint;
    res.redirect(
      303,
      provider.authorizationUrl({
        state,
        codeChallenge: pkce.challenge,
        loginHint: hint !== undefined && LOGIN_HINT.test(hint) ? hint : undefined,
      }),
    );
  });

  router.get('/google/callback', limit, async (req, res) => {
    const provider = ctx.identityProvider;
    if (provider === null) {
      throw new DependencyUnavailableError('Google sign-in is not configured on this server.');
    }
    const param = (name: string) =>
      typeof req.query[name] === 'string' ? req.query[name] : undefined;
    clearStateCookie(res);

    const saved = await stateCodec.decode(readCookie(req, OAUTH_STATE_COOKIE), param('state'));
    if (saved === null) {
      redirectToWeb(res, '/login', { error: 'state' });
      return;
    }
    if (param('error') !== undefined) {
      // `access_denied` = the user cancelled on the consent screen.
      redirectToWeb(res, '/login', {
        error: param('error') === 'access_denied' ? 'cancelled' : 'failed',
      });
      return;
    }
    const code = param('code');
    if (code === undefined || code.length > 2048) {
      redirectToWeb(res, '/login', { error: 'failed' });
      return;
    }

    let result;
    try {
      const identity = await provider.exchange(code, saved.verifier);
      result = await service.signIn(identity);
    } catch (error) {
      if (!(error instanceof IdentityProviderError)) throw error;
      ctx.logger.warn({ err: { message: error.message } }, 'google sign-in failed');
      redirectToWeb(res, '/login', { error: 'failed' });
      return;
    }
    if (!result.ok) {
      redirectToWeb(res, '/login', { error: result.reason });
      return;
    }

    const token = await ctx.sessions.create(result.userId);
    setRefreshCookie(res, token, ctx.sessions.ttlSeconds);
    redirectToWeb(
      res,
      '/auth/complete',
      saved.returnTo === null ? {} : { returnTo: saved.returnTo },
    );
  });

  router.post('/refresh', sessionLimit, async (req, res) => {
    assertSameOriginPost(req);
    const token = readCookie(req, REFRESH_COOKIE);
    if (token === undefined || token.length > 200) throw new UnauthenticatedError();
    const outcome = await ctx.sessions.refresh(token);
    if (outcome.kind === 'invalid') {
      setRefreshCookie(res, '', 0);
      throw new UnauthenticatedError('The session has expired. Sign in again.');
    }
    if (outcome.kind === 'rotated') setRefreshCookie(res, outcome.token, ctx.sessions.ttlSeconds);

    const user = await ctx.prisma.user.findUniqueOrThrow({
      where: { id: outcome.userId },
      include: currentUserInclude,
    });
    const accessToken = await ctx.accessTokens.issue({ id: user.id, role: user.role });
    res.setHeader('Cache-Control', 'no-store');
    res.json(
      SessionResponse.parse({
        accessToken,
        expiresIn: ctx.accessTokens.expiresIn,
        user: toCurrentUser(user),
      }),
    );
  });

  router.post('/logout', sessionLimit, async (req, res) => {
    assertSameOriginPost(req);
    const token = readCookie(req, REFRESH_COOKIE);
    if (token !== undefined && token.length <= 200) await ctx.sessions.revoke(token);
    setRefreshCookie(res, '', 0);
    res.status(204).end();
  });

  return router;
}
