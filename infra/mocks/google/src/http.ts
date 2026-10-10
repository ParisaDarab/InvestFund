import type { CallRecord } from './calls.js';
import type { MockGoogleConfig } from './config.js';
import type { ControlEffect } from './control.js';
import type { GoogleState, Grant, User } from './state.js';
import type { Request, Response } from 'express';

/** What the route modules need from the app. */
export interface Context {
  config: MockGoogleConfig;
  /** Current state (replaced on `POST /__reset`). */
  state(): GoogleState;
  record(req: Request): CallRecord | undefined;
  effect(req: Request): ControlEffect | undefined;
}

const STATUS_TEXT: Record<number, string> = {
  400: 'INVALID_ARGUMENT',
  401: 'UNAUTHENTICATED',
  403: 'PERMISSION_DENIED',
  404: 'NOT_FOUND',
  409: 'ALREADY_EXISTS',
  410: 'FAILED_PRECONDITION',
  429: 'RESOURCE_EXHAUSTED',
  500: 'INTERNAL',
  503: 'UNAVAILABLE',
};

/** Google API (Gmail, Calendar) error body. */
export function googleError(res: Response, status: number, reason: string, message: string): void {
  if (status === 401) res.set('www-authenticate', 'Bearer realm="https://accounts.google.com/"');
  res.status(status).json({
    error: {
      code: status,
      message,
      errors: [{ message, domain: 'global', reason }],
      status: STATUS_TEXT[status] ?? 'UNKNOWN',
    },
  });
}

/** OAuth 2.0 endpoint error body (RFC 6749 §5.2). */
export function oauthError(
  res: Response,
  status: number,
  error: string,
  description: string,
): void {
  res.set('cache-control', 'no-store');
  res.status(status).json({ error, error_description: description });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** First value of a query parameter. */
export function queryParam(req: Request, name: string): string | undefined {
  return queryParams(req, name)[0];
}

/**
 * All values of a repeated query parameter. Express 5's default "simple" query parser only yields
 * strings and string arrays, but the typings allow nested `ParsedQs` objects, so non-strings are
 * dropped rather than trusted.
 */
export function queryParams(req: Request, name: string): string[] {
  const value: unknown = req.query[name];
  const values: unknown[] = Array.isArray(value) ? value : [value];
  return values.filter((v): v is string => typeof v === 'string');
}

/** String member of a parsed (form or JSON) body. */
export function bodyParam(req: Request, name: string): string | undefined {
  const body: unknown = req.body;
  if (!isRecord(body)) return undefined;
  const value = body[name];
  return typeof value === 'string' ? value : undefined;
}

export interface Authenticated {
  grant: Grant;
  user: User;
}

/**
 * Checks the bearer access token and that it carries one of `acceptedScopes`. Sends the Google
 * error and returns `null` when it does not. `style: 'userinfo'` uses the OAuth error body that
 * the userinfo endpoint returns.
 */
export function authenticate(
  ctx: Context,
  req: Request,
  res: Response,
  acceptedScopes: readonly string[] | null,
  style: 'api' | 'userinfo' = 'api',
): Authenticated | null {
  const header = req.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  const grant = token === undefined ? undefined : ctx.state().accessTokens.get(token);
  const user = grant === undefined ? undefined : ctx.state().users.get(grant.email);
  if (grant === undefined || grant.revoked || user === undefined) {
    if (style === 'userinfo') {
      res.set('www-authenticate', 'Bearer realm="https://accounts.google.com/"');
      oauthError(res, 401, 'invalid_request', 'Invalid Credentials');
    } else if (token === undefined) {
      googleError(
        res,
        401,
        'required',
        'Request is missing required authentication credential. Expected OAuth 2 access token.',
      );
    } else {
      googleError(res, 401, 'authError', 'Request had invalid authentication credentials.');
    }
    return null;
  }
  const record = ctx.record(req);
  if (record !== undefined) record.user = user.email;
  if (acceptedScopes !== null && !acceptedScopes.some((scope) => grant.scopes.includes(scope))) {
    googleError(
      res,
      403,
      'insufficientPermissions',
      'Request had insufficient authentication scopes.',
    );
    return null;
  }
  return { grant, user };
}

/** `userId` path parameter: `me` or the authenticated user's own address. */
export function isOwnMailbox(userId: string, user: User): boolean {
  return userId === 'me' || userId.toLowerCase() === user.email;
}
