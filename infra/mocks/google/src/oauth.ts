import express from 'express';

import { authenticate, bodyParam, oauthError, queryParam, type Context } from './http.js';
import { PKCE_VALUE, verifyPkce, type PkceMethod } from './pkce.js';
import { SCOPE } from './state.js';

import type { Application, Request, Response } from 'express';

/** Lifetime reported for access tokens (the mock never expires them on its own). */
const EXPIRES_IN = 3599;
const PROMPTS = new Set(['none', 'consent', 'select_account']);

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** Client credentials from the body or from HTTP Basic authentication. */
function clientCredentials(req: Request): { id?: string; secret?: string } {
  const basic = /^Basic\s+(\S+)$/i.exec(req.get('authorization') ?? '')?.[1];
  if (basic !== undefined) {
    const decoded = Buffer.from(basic, 'base64').toString('utf8');
    const colon = decoded.indexOf(':');
    if (colon > 0) {
      return {
        id: decodeURIComponent(decoded.slice(0, colon)),
        secret: decodeURIComponent(decoded.slice(colon + 1)),
      };
    }
  }
  const id = bodyParam(req, 'client_id');
  const secret = bodyParam(req, 'client_secret');
  return { ...(id === undefined ? {} : { id }), ...(secret === undefined ? {} : { secret }) };
}

export function registerOAuth(app: Application, ctx: Context): void {
  const forms = [
    express.urlencoded({ extended: false, limit: '16kb' }),
    express.json({ limit: '16kb' }),
  ];

  /**
   * Consent endpoint (browser-facing). There is no consent screen: the mock "consents" for the
   * seeded user named by `login_hint` (or the first seeded user) and redirects straight back.
   */
  app.get('/o/oauth2/v2/auth', (req, res) => {
    const record = ctx.record(req);
    const state = ctx.state();
    const clientId = queryParam(req, 'client_id');
    const redirectUri = queryParam(req, 'redirect_uri');
    const scopeParam = queryParam(req, 'scope');
    const challenge = queryParam(req, 'code_challenge');
    const method = queryParam(req, 'code_challenge_method');
    const prompts = (queryParam(req, 'prompt') ?? '').split(/\s+/).filter(Boolean);
    const loginHint = queryParam(req, 'login_hint')?.toLowerCase();
    if (record !== undefined) {
      record.detail = {
        clientId: clientId ?? null,
        responseType: queryParam(req, 'response_type') ?? null,
        scopes: scopeParam?.split(/\s+/).filter(Boolean) ?? [],
        accessType: queryParam(req, 'access_type') ?? null,
        prompt: prompts,
        includeGrantedScopes: queryParam(req, 'include_granted_scopes') === 'true',
        codeChallengeMethod: challenge === undefined ? null : (method ?? 'plain'),
        hasState: queryParam(req, 'state') !== undefined,
      };
    }

    // Errors about the client or the redirect URI are shown to the user, never redirected.
    if (clientId === undefined || clientId === '') {
      oauthError(res, 400, 'invalid_request', 'Missing required parameter: client_id');
      return;
    }
    if (ctx.config.clientId !== null && clientId !== ctx.config.clientId) {
      oauthError(res, 401, 'invalid_client', 'The OAuth client was not found.');
      return;
    }
    if (redirectUri === undefined || !isHttpUrl(redirectUri)) {
      oauthError(res, 400, 'invalid_request', 'Invalid parameter value for redirect_uri');
      return;
    }

    const back = (params: Record<string, string>): void => {
      const url = new URL(redirectUri);
      for (const [name, value] of Object.entries(params)) url.searchParams.set(name, value);
      const stateParam = queryParam(req, 'state');
      if (stateParam !== undefined) url.searchParams.set('state', stateParam);
      res.redirect(302, url.toString());
    };

    const effect = ctx.effect(req);
    if (typeof effect?.fail === 'string') {
      back({ error: 'access_denied' });
      return;
    }
    if (typeof effect?.fail === 'number') {
      oauthError(res, effect.fail, 'server_error', 'Injected failure (mock-google)');
      return;
    }
    if (queryParam(req, 'response_type') !== 'code') {
      back({ error: 'unsupported_response_type' });
      return;
    }
    const scopes = [...new Set(scopeParam?.split(/\s+/).filter(Boolean) ?? [])];
    if (scopes.length === 0) {
      back({ error: 'invalid_request', error_description: 'Missing required parameter: scope' });
      return;
    }
    let pkce: { value: string; method: PkceMethod } | null = null;
    if (challenge !== undefined) {
      const pkceMethod = method ?? 'plain';
      if ((pkceMethod !== 'S256' && pkceMethod !== 'plain') || !PKCE_VALUE.test(challenge)) {
        back({ error: 'invalid_request', error_description: 'Invalid code_challenge' });
        return;
      }
      pkce = { value: challenge, method: pkceMethod };
    } else if (method !== undefined) {
      back({ error: 'invalid_request', error_description: 'Missing code_challenge' });
      return;
    }
    if (
      prompts.some((prompt) => !PROMPTS.has(prompt)) ||
      (prompts.includes('none') && prompts.length > 1)
    ) {
      back({ error: 'invalid_request', error_description: 'Invalid prompt' });
      return;
    }

    const user =
      (loginHint === undefined ? undefined : state.users.get(loginHint)) ??
      state.users.values().next().value;
    if (user === undefined) {
      back({ error: 'access_denied', error_description: 'No seeded users (POST /__seed)' });
      return;
    }
    if (record !== undefined) record.user = user.email;

    const consentKey = `${clientId} ${user.email}`;
    const previous = state.consents.get(consentKey) ?? new Set<string>();
    if (prompts.includes('none') && !scopes.every((scope) => previous.has(scope))) {
      back({ error: 'consent_required' });
      return;
    }
    const granted =
      queryParam(req, 'include_granted_scopes') === 'true'
        ? [...new Set([...previous, ...scopes])]
        : scopes;
    state.consents.set(consentKey, new Set([...previous, ...scopes]));

    const code = state.nextCode();
    state.codes.set(code, {
      clientId,
      redirectUri,
      email: user.email,
      scopes: granted,
      challenge: pkce,
      offline: queryParam(req, 'access_type') === 'offline',
      used: false,
    });
    back({ code, scope: granted.join(' '), authuser: '0' });
  });

  app.post('/token', ...forms, (req, res) => {
    const record = ctx.record(req);
    const state = ctx.state();
    const grantType = bodyParam(req, 'grant_type');
    const client = clientCredentials(req);
    if (record !== undefined)
      record.detail = { grantType: grantType ?? null, clientId: client.id ?? null };
    res.set('cache-control', 'no-store');

    if (client.id === undefined || client.id === '') {
      oauthError(res, 401, 'invalid_client', 'The OAuth client was not found.');
      return;
    }
    if (
      (ctx.config.clientId !== null && client.id !== ctx.config.clientId) ||
      (ctx.config.clientSecret !== null && client.secret !== ctx.config.clientSecret)
    ) {
      oauthError(res, 401, 'invalid_client', 'Unauthorized');
      return;
    }

    if (grantType === 'authorization_code') {
      const code = bodyParam(req, 'code');
      if (code === undefined) {
        oauthError(res, 400, 'invalid_request', 'Missing required parameter: code');
        return;
      }
      const entry = state.codes.get(code);
      if (entry === undefined || entry.used || entry.clientId !== client.id) {
        oauthError(res, 400, 'invalid_grant', 'Malformed auth code.');
        return;
      }
      if (bodyParam(req, 'redirect_uri') !== entry.redirectUri) {
        oauthError(res, 400, 'redirect_uri_mismatch', 'Bad Request');
        return;
      }
      if (entry.challenge !== null) {
        const verifier = bodyParam(req, 'code_verifier');
        if (verifier === undefined) {
          oauthError(res, 400, 'invalid_grant', 'Missing code verifier.');
          return;
        }
        if (!verifyPkce(entry.challenge.method, entry.challenge.value, verifier)) {
          oauthError(res, 400, 'invalid_grant', 'Invalid code verifier.');
          return;
        }
      }
      entry.used = true;
      if (record !== undefined) record.user = entry.email;
      const grant = { email: entry.email, clientId: client.id, scopes: entry.scopes };
      const refreshToken = entry.offline ? state.issueRefreshToken(grant) : null;
      const accessToken = state.issueAccessToken({ ...grant, refreshToken });
      state.tick();
      res.json({
        access_token: accessToken,
        expires_in: EXPIRES_IN,
        ...(refreshToken === null ? {} : { refresh_token: refreshToken }),
        scope: entry.scopes.join(' '),
        token_type: 'Bearer',
      });
      return;
    }

    if (grantType === 'refresh_token') {
      const refreshToken = bodyParam(req, 'refresh_token');
      if (refreshToken === undefined) {
        oauthError(res, 400, 'invalid_request', 'Missing required parameter: refresh_token');
        return;
      }
      const grant = state.refreshTokens.get(refreshToken);
      if (grant === undefined || grant.revoked || grant.clientId !== client.id) {
        oauthError(res, 400, 'invalid_grant', 'Token has been expired or revoked.');
        return;
      }
      if (record !== undefined) record.user = grant.email;
      const accessToken = state.issueAccessToken({
        email: grant.email,
        clientId: grant.clientId,
        scopes: grant.scopes,
        refreshToken,
      });
      state.tick();
      res.json({
        access_token: accessToken,
        expires_in: EXPIRES_IN,
        scope: grant.scopes.join(' '),
        token_type: 'Bearer',
      });
      return;
    }

    oauthError(res, 400, 'unsupported_grant_type', `Invalid grant_type: ${grantType ?? ''}`);
  });

  app.post('/revoke', ...forms, (req, res) => {
    const token = queryParam(req, 'token') ?? bodyParam(req, 'token');
    if (token === undefined) {
      oauthError(res, 400, 'invalid_request', 'Missing required parameter: token');
      return;
    }
    const grant = ctx.state().accessTokens.get(token) ?? ctx.state().refreshTokens.get(token);
    const record = ctx.record(req);
    if (record !== undefined && grant !== undefined) record.user = grant.email;
    if (!ctx.state().revoke(token)) {
      oauthError(res, 400, 'invalid_token', 'Token expired or revoked');
      return;
    }
    res.json({});
  });

  app.get('/oauth2/v3/userinfo', (req: Request, res: Response) => {
    const auth = authenticate(ctx, req, res, null, 'userinfo');
    if (auth === null) return;
    const { grant, user } = auth;
    const has = (...scopes: string[]): boolean => scopes.some((s) => grant.scopes.includes(s));
    res.json({
      sub: user.sub,
      ...(has('profile', SCOPE.userinfoProfile)
        ? {
            name: user.name,
            ...(user.givenName === null ? {} : { given_name: user.givenName }),
            ...(user.familyName === null ? {} : { family_name: user.familyName }),
            ...(user.picture === null ? {} : { picture: user.picture }),
          }
        : {}),
      ...(has('email', SCOPE.userinfoEmail) ? { email: user.email, email_verified: true } : {}),
    });
  });
}
