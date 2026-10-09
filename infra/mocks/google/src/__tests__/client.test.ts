// Over-the-wire test against a real listening server, sending the requests that
// `google-auth-library` and `googleapis` send (form-encoded token requests, bearer-authenticated
// JSON API calls, with base URLs taken from GOOGLE_*_BASE_URL-style settings).
//
// The card asks for one test through the official Google client library. `googleapis` (or
// `@googleapis/gmail` / `@googleapis/calendar`) is a P6 dependency (PHASE_PLAN §6), not approved
// for P0, so that test is a `todo` until Gate X approves it.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMockGoogle } from '../app.js';
import { loadConfig } from '../config.js';
import { encodeBase64Url } from '../mime.js';
import { base64UrlSha256 } from '../pkce.js';
import { SCOPE } from '../state.js';

import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let server: Server;
/** One origin serves all three bases, exactly as the sandbox configures them. */
let base: { auth: string; oauth2: string; api: string };

beforeAll(async () => {
  const mock = createMockGoogle(loadConfig({}));
  server = await new Promise<Server>((resolve, reject) => {
    const listening = mock.app.listen(0, '127.0.0.1', (error) => {
      if (error === undefined) resolve(listening);
      else reject(error);
    });
  });
  const origin = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  base = { auth: origin, oauth2: origin, api: origin };
});

afterAll(async () => {
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

const clientHeaders = { 'x-goog-api-client': 'gl-node/22.23.3 gdcl/8.0.0' };

describe('Google client wire compatibility over HTTP', () => {
  it('runs sign-in, Gmail send and Calendar insert end to end', async () => {
    const verifier = 'wire-test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';
    const redirectUri = 'http://localhost:3000/api/v1/auth/google/callback';
    const authorize = new URL('/o/oauth2/v2/auth', base.auth);
    authorize.search = new URLSearchParams({
      client_id: 'sandbox-client-id',
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: ['openid', 'email', 'profile', SCOPE.gmailSend, SCOPE.calendarEvents].join(' '),
      access_type: 'offline',
      prompt: 'consent',
      state: 'abc',
      code_challenge: base64UrlSha256(verifier),
      code_challenge_method: 'S256',
    }).toString();

    const consent = await fetch(authorize, { redirect: 'manual' });
    expect(consent.status).toBe(302);
    const callback = new URL(consent.headers.get('location') ?? '');
    expect(callback.searchParams.get('state')).toBe('abc');

    const tokenRes = await fetch(new URL('/token', base.oauth2), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', ...clientHeaders },
      body: new URLSearchParams({
        code: callback.searchParams.get('code') ?? '',
        client_id: 'sandbox-client-id',
        client_secret: 'sandbox-client-secret',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: verifier,
      }),
    });
    expect(tokenRes.status).toBe(200);
    const tokens = (await tokenRes.json()) as { access_token: string; refresh_token: string };
    expect(tokens.refresh_token).toBeTruthy();
    const auth = { authorization: `Bearer ${tokens.access_token}`, ...clientHeaders };

    const userinfo = await fetch(new URL('/oauth2/v3/userinfo', base.api), { headers: auth });
    expect(((await userinfo.json()) as { email_verified: boolean }).email_verified).toBe(true);

    const raw = encodeBase64Url(
      'To: investor@investfund.test\r\nSubject: Wire test\r\n\r\nHello over HTTP',
    );
    const sent = await fetch(new URL('/gmail/v1/users/me/messages/send', base.api), {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    expect(sent.status).toBe(200);
    expect(((await sent.json()) as { labelIds: string[] }).labelIds).toEqual(['SENT']);

    const event = await fetch(
      new URL(
        '/calendar/v3/calendars/primary/events?conferenceDataVersion=1&sendUpdates=all',
        base.api,
      ),
      {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          summary: 'Wire test',
          start: { dateTime: '2026-01-06T10:00:00Z' },
          end: { dateTime: '2026-01-06T10:30:00Z' },
          conferenceData: { createRequest: { requestId: 'wire-1' } },
        }),
      },
    );
    expect(event.status).toBe(200);
    expect(((await event.json()) as { hangoutLink?: string }).hangoutLink).toMatch(
      /^https:\/\/meet\.google\.com\//,
    );

    const calls = (await (await fetch(new URL('/__calls', base.api))).json()) as {
      calls: { method: string; path: string; status: number }[];
    };
    expect(calls.calls.map((call) => `${call.method} ${call.path} ${String(call.status)}`)).toEqual(
      [
        'GET /o/oauth2/v2/auth 302',
        'POST /token 200',
        'GET /oauth2/v3/userinfo 200',
        'POST /gmail/v1/users/me/messages/send 200',
        'POST /calendar/v3/calendars/primary/events 200',
      ],
    );
  });

  it.todo(
    'through the official Google client library (needs Gate X: `googleapis` is a P6 dependency)',
  );
});
