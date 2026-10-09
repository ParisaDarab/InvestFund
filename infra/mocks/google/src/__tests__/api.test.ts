import request from 'supertest';
import { beforeEach, describe, expect, it } from 'vitest';

import { createMockGoogle, type MockGoogle } from '../app.js';
import { loadConfig } from '../config.js';
import { encodeBase64Url } from '../mime.js';
import { base64UrlSha256 } from '../pkce.js';
import { SCOPE } from '../state.js';

import type { CallRecord } from '../calls.js';

const CLIENT_ID = 'sandbox-client-id';
const CLIENT_SECRET = 'sandbox-client-secret';
const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';
const VERIFIER = 'test-verifier-0123456789-abcdefghijklmnopqrstuvwxyz';
const FOUNDER = 'founder@investfund.test';
const INVESTOR = 'investor@investfund.test';

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface OAuthErrorBody {
  error: string;
  error_description: string;
}

interface GoogleErrorBody {
  error: { code: number; message: string; status: string; errors: { reason: string }[] };
}

let mock: MockGoogle;

beforeEach(() => {
  mock = createMockGoogle(loadConfig({}));
});

function authorizeUrl(params: Record<string, string>): string {
  const query = new URLSearchParams({
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    state: 'state-123',
    code_challenge: base64UrlSha256(VERIFIER),
    code_challenge_method: 'S256',
    ...params,
  });
  return `/o/oauth2/v2/auth?${query.toString()}`;
}

/** Follows the consent redirect and returns the parameters sent back to the app. */
async function authorize(params: Record<string, string> = {}): Promise<URLSearchParams> {
  const res = await request(mock.app).get(authorizeUrl(params)).redirects(0);
  expect(res.status).toBe(302);
  const location = new URL(res.headers.location ?? '');
  expect(`${location.origin}${location.pathname}`).toBe(REDIRECT_URI);
  return location.searchParams;
}

function exchange(form: Record<string, string>) {
  return request(mock.app)
    .post('/token')
    .type('form')
    .send({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...form });
}

async function signIn(
  scope = 'openid email profile',
  extra: Record<string, string> = {},
): Promise<TokenResponse> {
  const params = await authorize({ scope, access_type: 'offline', ...extra });
  const res = await exchange({
    grant_type: 'authorization_code',
    code: params.get('code') ?? '',
    redirect_uri: REDIRECT_URI,
    code_verifier: VERIFIER,
  });
  expect(res.status).toBe(200);
  return res.body as TokenResponse;
}

async function callLog(): Promise<CallRecord[]> {
  return ((await request(mock.app).get('/__calls')).body as { calls: CallRecord[] }).calls;
}

function rawMessage(headers: Record<string, string>, body = 'Hello'): string {
  const lines = Object.entries(headers).map(([name, value]) => `${name}: ${value}`);
  return encodeBase64Url(
    [...lines, 'Content-Type: text/plain; charset=UTF-8', '', body].join('\r\n'),
  );
}

const ALL_SCOPES = [
  'openid email profile',
  SCOPE.gmailSend,
  SCOPE.gmailReadonly,
  SCOPE.calendarEvents,
  SCOPE.calendarFreebusy,
].join(' ');

describe('GET /health', () => {
  it('is ok and not recorded', async () => {
    expect((await request(mock.app).get('/health')).body).toEqual({ status: 'ok' });
    expect(await callLog()).toEqual([]);
  });
});

describe('OAuth 2.0', () => {
  it('redirects back with a code and the state (auto-consent)', async () => {
    const params = await authorize();
    expect(params.get('state')).toBe('state-123');
    expect(params.get('code')).toBe('4/0mock-code-000001');
    expect(params.get('scope')).toBe('openid email profile');
  });

  it('exchanges the code only with the matching PKCE verifier (AC1)', async () => {
    const params = await authorize();
    const code = params.get('code') ?? '';
    const base = { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI };

    const wrong = await exchange({ ...base, code_verifier: `${VERIFIER}-wrong` });
    expect(wrong.status).toBe(400);
    expect((wrong.body as OAuthErrorBody).error).toBe('invalid_grant');

    const missing = await exchange(base);
    expect(missing.status).toBe(400);
    expect((missing.body as OAuthErrorBody).error).toBe('invalid_grant');

    const ok = await exchange({ ...base, code_verifier: VERIFIER });
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
    expect(ok.body).toEqual({
      access_token: 'ya29.mock-access-000001',
      expires_in: 3599,
      scope: 'openid email profile',
      token_type: 'Bearer',
    });

    const reused = await exchange({ ...base, code_verifier: VERIFIER });
    expect(reused.status).toBe(400);
    expect((reused.body as OAuthErrorBody).error).toBe('invalid_grant');
  });

  it('rejects a redirect_uri that differs from the authorize request', async () => {
    const params = await authorize();
    const res = await exchange({
      grant_type: 'authorization_code',
      code: params.get('code') ?? '',
      redirect_uri: 'http://localhost:3000/other',
      code_verifier: VERIFIER,
    });
    expect(res.status).toBe(400);
    expect((res.body as OAuthErrorBody).error).toBe('redirect_uri_mismatch');
  });

  it('accepts client credentials through HTTP Basic auth', async () => {
    const params = await authorize();
    const res = await request(mock.app)
      .post('/token')
      .set(
        'authorization',
        `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
      )
      .type('form')
      .send({
        grant_type: 'authorization_code',
        code: params.get('code') ?? '',
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      });
    expect(res.status).toBe(200);
  });

  it('validates the authorize request', async () => {
    const noClient = await request(mock.app)
      .get('/o/oauth2/v2/auth?redirect_uri=http://localhost/cb&response_type=code&scope=email')
      .redirects(0);
    expect(noClient.status).toBe(400);

    const badRedirect = await request(mock.app)
      .get(authorizeUrl({ redirect_uri: 'javascript:alert(1)' }))
      .redirects(0);
    expect(badRedirect.status).toBe(400);

    expect((await authorize({ response_type: 'token' })).get('error')).toBe(
      'unsupported_response_type',
    );
    expect((await authorize({ scope: '' })).get('error')).toBe('invalid_request');
    expect((await authorize({ code_challenge: 'short' })).get('error')).toBe('invalid_request');
    expect((await authorize({ prompt: 'none consent' })).get('error')).toBe('invalid_request');
  });

  it('supports prompt=none and include_granted_scopes', async () => {
    expect((await authorize({ prompt: 'none' })).get('error')).toBe('consent_required');
    await authorize({ prompt: 'consent' });
    expect((await authorize({ prompt: 'none' })).get('code')).not.toBeNull();

    const incremental = await authorize({
      scope: SCOPE.gmailSend,
      include_granted_scopes: 'true',
    });
    expect(incremental.get('scope')?.split(' ').sort()).toEqual(
      ['email', 'openid', 'profile', SCOPE.gmailSend].sort(),
    );
  });

  it('signs in as the user named by login_hint', async () => {
    const tokens = await signIn('openid email profile', { login_hint: INVESTOR });
    const res = await request(mock.app)
      .get('/oauth2/v3/userinfo')
      .set('authorization', `Bearer ${tokens.access_token}`);
    expect((res.body as { email: string }).email).toBe(INVESTOR);
  });

  it('returns the seeded user from userinfo (AC2)', async () => {
    const tokens = await signIn();
    const res = await request(mock.app)
      .get('/oauth2/v3/userinfo')
      .set('authorization', `Bearer ${tokens.access_token}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      sub: expect.stringMatching(/^1\d{20}$/) as unknown,
      email: FOUNDER,
      email_verified: true,
      name: 'Fay Founder',
      given_name: 'Fay',
      family_name: 'Founder',
    });
  });

  it('omits email and profile fields the token has no scope for', async () => {
    const tokens = await signIn('openid');
    const res = await request(mock.app)
      .get('/oauth2/v3/userinfo')
      .set('authorization', `Bearer ${tokens.access_token}`);
    expect(Object.keys(res.body as object)).toEqual(['sub']);
  });

  it('rejects userinfo without a valid token', async () => {
    const res = await request(mock.app).get('/oauth2/v3/userinfo').set('authorization', 'Bearer x');
    expect(res.status).toBe(401);
    expect((res.body as OAuthErrorBody).error).toBe('invalid_request');
  });

  it('refreshes tokens, and revocation invalidates them', async () => {
    const tokens = await signIn();
    expect(tokens.refresh_token).toBe('1//0mock-refresh-000001');
    const refreshed = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token ?? '',
    });
    expect(refreshed.status).toBe(200);
    const fresh = refreshed.body as TokenResponse;
    expect(fresh.refresh_token).toBeUndefined();
    expect(fresh.access_token).not.toBe(tokens.access_token);

    const revoke = await request(mock.app)
      .post('/revoke')
      .type('form')
      .send({ token: tokens.refresh_token ?? '' });
    expect(revoke.status).toBe(200);

    const again = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token ?? '',
    });
    expect((again.body as OAuthErrorBody).error).toBe('invalid_grant');
    const userinfo = await request(mock.app)
      .get('/oauth2/v3/userinfo')
      .set('authorization', `Bearer ${fresh.access_token}`);
    expect(userinfo.status).toBe(401);

    const unknown = await request(mock.app).post('/revoke?token=unknown-token');
    expect(unknown.status).toBe(400);
  });

  it('rejects unknown grant types and missing client IDs', async () => {
    expect((await exchange({ grant_type: 'password' })).status).toBe(400);
    const noClient = await request(mock.app)
      .post('/token')
      .type('form')
      .send({ grant_type: 'refresh_token' });
    expect(noClient.status).toBe(401);
  });

  it('enforces the configured client ID and secret', async () => {
    mock = createMockGoogle(
      loadConfig({ MOCK_GOOGLE_CLIENT_ID: CLIENT_ID, MOCK_GOOGLE_CLIENT_SECRET: CLIENT_SECRET }),
    );
    const other = await request(mock.app)
      .get(authorizeUrl({ client_id: 'other' }))
      .redirects(0);
    expect(other.status).toBe(401);
    const params = await authorize();
    const badSecret = await request(mock.app)
      .post('/token')
      .type('form')
      .send({
        grant_type: 'authorization_code',
        client_id: CLIENT_ID,
        client_secret: 'wrong',
        code: params.get('code') ?? '',
        redirect_uri: REDIRECT_URI,
        code_verifier: VERIFIER,
      });
    expect(badSecret.status).toBe(401);
    expect((badSecret.body as OAuthErrorBody).error).toBe('invalid_client');
  });

  it('never records secrets, codes or tokens', async () => {
    const tokens = await signIn();
    await request(mock.app)
      .get('/oauth2/v3/userinfo')
      .set('authorization', `Bearer ${tokens.access_token}`);
    const log = JSON.stringify(await callLog());
    for (const secret of [CLIENT_SECRET, VERIFIER, tokens.access_token, '4/0mock-code']) {
      expect(log).not.toContain(secret);
    }
  });
});

describe('Gmail', () => {
  let token: string;
  beforeEach(async () => {
    token = (await signIn(ALL_SCOPES)).access_token;
  });

  function send(raw: string, threadId?: string) {
    return request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .set('authorization', `Bearer ${token}`)
      .send({ raw, ...(threadId === undefined ? {} : { threadId }) });
  }

  it('sends a message and records the decoded headers (AC3)', async () => {
    const res = await send(
      rawMessage({
        To: `Ian Investor <${INVESTOR}>`,
        Subject: '=?UTF-8?B?SW50cm8g4oCTIEFjbWU=?=',
      }),
    );
    expect(res.status).toBe(200);
    const sent = res.body as { id: string; threadId: string; labelIds: string[] };
    expect(sent).toEqual({ id: sent.id, threadId: sent.id, labelIds: ['SENT'] });
    expect(sent.id).toMatch(/^[0-9a-f]{16}$/);

    const record = (await callLog()).find((call) => call.path.endsWith('/messages/send'));
    expect(record).toMatchObject({
      method: 'POST',
      status: 200,
      user: FOUNDER,
      detail: {
        messageId: sent.id,
        threadId: sent.threadId,
        recipients: [INVESTOR],
        headers: { to: `Ian Investor <${INVESTOR}>`, subject: 'Intro – Acme', from: FOUNDER },
      },
    });
    expect(JSON.stringify(record)).not.toContain('Hello');
  });

  it('appends to an existing thread and rejects unknown threads', async () => {
    const first = (await send(rawMessage({ To: INVESTOR, Subject: 'One' }))).body as {
      threadId: string;
    };
    const second = await send(rawMessage({ To: INVESTOR, Subject: 'Re: One' }), first.threadId);
    expect((second.body as { threadId: string }).threadId).toBe(first.threadId);
    const unknown = await send(rawMessage({ To: INVESTOR, Subject: 'x' }), 'nope');
    expect(unknown.status).toBe(404);
  });

  it('rejects messages without raw, with invalid raw or without recipients', async () => {
    const missing = await request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .set('authorization', `Bearer ${token}`)
      .send({});
    expect(missing.status).toBe(400);
    expect((await send('!!!')).status).toBe(400);
    const noRecipient = await send(rawMessage({ Subject: 'x' }));
    expect(noRecipient.status).toBe(400);
    expect((noRecipient.body as GoogleErrorBody).error.status).toBe('INVALID_ARGUMENT');
  });

  it('requires a token with a send scope, for the own mailbox', async () => {
    const noToken = await request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .send({ raw: rawMessage({ To: INVESTOR }) });
    expect(noToken.status).toBe(401);
    expect(noToken.headers['www-authenticate']).toContain('Bearer');

    const readOnly = (await signIn(`openid ${SCOPE.gmailReadonly}`)).access_token;
    const forbidden = await request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .set('authorization', `Bearer ${readOnly}`)
      .send({ raw: rawMessage({ To: INVESTOR }) });
    expect(forbidden.status).toBe(403);
    expect((forbidden.body as GoogleErrorBody).error.errors[0]?.reason).toBe(
      'insufficientPermissions',
    );

    const otherMailbox = await request(mock.app)
      .post(`/gmail/v1/users/${INVESTOR}/messages/send`)
      .set('authorization', `Bearer ${token}`)
      .send({ raw: rawMessage({ To: INVESTOR }) });
    expect(otherMailbox.status).toBe(403);
  });

  it('lists an injected reply in history after the previous historyId (AC4)', async () => {
    const sent = (await send(rawMessage({ To: INVESTOR, Subject: 'Intro' }))).body as {
      id: string;
      threadId: string;
    };
    const thread = await request(mock.app)
      .get(`/gmail/v1/users/me/threads/${sent.threadId}`)
      .set('authorization', `Bearer ${token}`);
    const previous = (thread.body as { historyId: string }).historyId;

    const injected = await request(mock.app)
      .post('/__inject/reply')
      .send({ threadId: sent.threadId, body: 'Interested, let us talk.' });
    expect(injected.status).toBe(201);
    const reply = injected.body as {
      id: string;
      threadId: string;
      historyId: string;
      headers: Record<string, string | null>;
    };
    expect(reply.threadId).toBe(sent.threadId);
    expect(reply.headers).toMatchObject({
      from: INVESTOR,
      to: FOUNDER,
      subject: 'Re: Intro',
      inReplyTo: `<${sent.id}@mail.investfund.test>`,
    });

    const history = await request(mock.app)
      .get(`/gmail/v1/users/me/history?startHistoryId=${previous}&historyTypes=messageAdded`)
      .set('authorization', `Bearer ${token}`);
    expect(history.status).toBe(200);
    expect(history.body).toEqual({
      history: [
        {
          id: reply.historyId,
          messages: [{ id: reply.id, threadId: sent.threadId }],
          messagesAdded: [
            { message: { id: reply.id, threadId: sent.threadId, labelIds: ['INBOX', 'UNREAD'] } },
          ],
        },
      ],
      historyId: reply.historyId,
    });

    const nothingNew = await request(mock.app)
      .get(`/gmail/v1/users/me/history?startHistoryId=${reply.historyId}`)
      .set('authorization', `Bearer ${token}`);
    expect(nothingNew.body).toEqual({ historyId: reply.historyId });
  });

  it('pages history and validates startHistoryId', async () => {
    for (const subject of ['a', 'b', 'c'])
      await send(rawMessage({ To: INVESTOR, Subject: subject }));
    const page = await request(mock.app)
      .get('/gmail/v1/users/me/history?startHistoryId=1&maxResults=2')
      .set('authorization', `Bearer ${token}`);
    const body = page.body as { history: unknown[]; nextPageToken?: string };
    expect(body.history).toHaveLength(2);
    expect(body.nextPageToken).toBe('2');
    const rest = await request(mock.app)
      .get('/gmail/v1/users/me/history?startHistoryId=1&maxResults=2&pageToken=2')
      .set('authorization', `Bearer ${token}`);
    expect((rest.body as { history: unknown[] }).history).toHaveLength(1);

    const bad = await request(mock.app)
      .get('/gmail/v1/users/me/history')
      .set('authorization', `Bearer ${token}`);
    expect(bad.status).toBe(400);
  });

  it('gets a thread in full, metadata and minimal formats', async () => {
    const sent = (await send(rawMessage({ To: INVESTOR, Subject: 'Hi' }, 'Body text'))).body as {
      threadId: string;
    };
    const url = `/gmail/v1/users/me/threads/${sent.threadId}`;
    const full = await request(mock.app).get(url).set('authorization', `Bearer ${token}`);
    const message = (
      full.body as {
        messages: {
          snippet: string;
          internalDate: string;
          payload: { headers: { name: string }[]; body: { data: string } };
        }[];
      }
    ).messages[0];
    expect(message?.snippet).toBe('Body text');
    expect(Buffer.from(message?.payload.body.data ?? '', 'base64url').toString()).toBe('Body text');
    expect(message?.internalDate).toMatch(/^\d+$/);

    const metadata = await request(mock.app)
      .get(`${url}?format=metadata&metadataHeaders=Subject`)
      .set('authorization', `Bearer ${token}`);
    expect(
      (metadata.body as { messages: { payload: { headers: unknown[] } }[] }).messages[0]?.payload
        .headers,
    ).toEqual([{ name: 'Subject', value: 'Hi' }]);

    const minimal = await request(mock.app)
      .get(`${url}?format=minimal`)
      .set('authorization', `Bearer ${token}`);
    expect((minimal.body as { messages: object[] }).messages[0]).not.toHaveProperty('payload');

    const missing = await request(mock.app)
      .get('/gmail/v1/users/me/threads/nope')
      .set('authorization', `Bearer ${token}`);
    expect(missing.status).toBe(404);
  });

  it('rejects an inject for an unknown thread', async () => {
    expect((await request(mock.app).post('/__inject/reply').send({ threadId: 'x' })).status).toBe(
      404,
    );
    expect((await request(mock.app).post('/__inject/reply').send({})).status).toBe(400);
  });
});

describe('Calendar', () => {
  let token: string;
  beforeEach(async () => {
    token = (await signIn(ALL_SCOPES)).access_token;
  });

  function freeBusy(body: object) {
    return request(mock.app)
      .post('/calendar/v3/freeBusy')
      .set('authorization', `Bearer ${token}`)
      .send(body);
  }

  function insert(body: object, query = '') {
    return request(mock.app)
      .post(`/calendar/v3/calendars/primary/events${query}`)
      .set('authorization', `Bearer ${token}`)
      .send(body);
  }

  it('returns the seeded busy blocks inside the window, in UTC (AC5)', async () => {
    const res = await freeBusy({
      timeMin: '2026-01-05T09:30:00+00:00',
      timeMax: '2026-01-05T18:00:00+01:00',
      timeZone: 'Europe/London',
      items: [{ id: 'primary' }, { id: INVESTOR }, { id: 'nobody@example.test' }],
    });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'calendar#freeBusy',
      timeMin: '2026-01-05T09:30:00Z',
      timeMax: '2026-01-05T17:00:00Z',
      calendars: {
        primary: {
          busy: [
            { start: '2026-01-05T09:30:00Z', end: '2026-01-05T10:00:00Z' },
            { start: '2026-01-05T13:30:00Z', end: '2026-01-05T14:00:00Z' },
          ],
        },
        [INVESTOR]: { busy: [{ start: '2026-01-05T11:00:00Z', end: '2026-01-05T12:00:00Z' }] },
        'nobody@example.test': { errors: [{ domain: 'global', reason: 'notFound' }], busy: [] },
      },
    });
  });

  it('validates the free/busy window', async () => {
    const empty = await freeBusy({
      timeMin: '2026-01-05T10:00:00Z',
      timeMax: '2026-01-05T10:00:00Z',
      items: [{ id: 'primary' }],
    });
    expect(empty.status).toBe(400);
    const invalid = await freeBusy({ timeMin: 'x', timeMax: 'y', items: [{ id: 'primary' }] });
    expect(invalid.status).toBe(400);
  });

  it('creates an event with a Meet link when conferenceDataVersion=1 (AC6)', async () => {
    const res = await insert(
      {
        summary: 'Intro call',
        start: { dateTime: '2026-01-05T15:00:00', timeZone: 'Europe/London' },
        end: { dateTime: '2026-01-05T15:30:00Z' },
        attendees: [{ email: INVESTOR }],
        conferenceData: {
          createRequest: { requestId: 'req-1', conferenceSolutionKey: { type: 'hangoutsMeet' } },
        },
      },
      '?conferenceDataVersion=1&sendUpdates=all',
    );
    expect(res.status).toBe(200);
    const event = res.body as {
      id: string;
      status: string;
      hangoutLink: string;
      attendees: { email: string; responseStatus: string }[];
      conferenceData: { createRequest: { status: { statusCode: string } } };
    };
    expect(event.id).toBe('mockevt000001');
    expect(event.status).toBe('confirmed');
    expect(event.hangoutLink).toMatch(/^https:\/\/meet\.google\.com\/[a-z]{3}-[a-z]{4}-[a-z]{3}$/);
    expect(event.conferenceData.createRequest.status.statusCode).toBe('success');
    expect(event.attendees).toEqual([{ email: INVESTOR, responseStatus: 'needsAction' }]);

    const record = (await callLog()).find((call) => call.path.endsWith('/events'));
    expect(record?.detail).toMatchObject({
      calendarId: 'primary',
      eventId: 'mockevt000001',
      sendUpdates: 'all',
      conferenceDataVersion: 1,
      attendees: [INVESTOR],
    });

    // The new event is busy time on the organiser's calendar.
    const busy = await freeBusy({
      timeMin: '2026-01-05T14:30:00Z',
      timeMax: '2026-01-05T16:00:00Z',
      items: [{ id: 'primary' }],
    });
    expect(
      (busy.body as { calendars: { primary: { busy: unknown[] } } }).calendars.primary,
    ).toEqual({ busy: [{ start: '2026-01-05T15:00:00Z', end: '2026-01-05T15:30:00Z' }] });
  });

  it('omits the Meet link without conferenceDataVersion=1', async () => {
    const res = await insert({
      start: { dateTime: '2026-01-06T10:00:00Z' },
      end: { dateTime: '2026-01-06T11:00:00Z' },
      conferenceData: { createRequest: { requestId: 'req-2' } },
    });
    expect(res.body).not.toHaveProperty('hangoutLink');
  });

  it('rejects invalid events, duplicates and other calendars', async () => {
    const range = await insert({
      start: { dateTime: '2026-01-06T11:00:00Z' },
      end: { dateTime: '2026-01-06T10:00:00Z' },
    });
    expect(range.status).toBe(400);
    const noTime = await insert({ start: {}, end: {} });
    expect(noTime.status).toBe(400);

    const body = {
      id: 'meetevent01',
      start: { date: '2026-01-07' },
      end: { date: '2026-01-08' },
    };
    expect((await insert(body)).status).toBe(200);
    expect((await insert(body)).status).toBe(409);

    const other = await request(mock.app)
      .post(`/calendar/v3/calendars/${encodeURIComponent(INVESTOR)}/events`)
      .set('authorization', `Bearer ${token}`)
      .send(body);
    expect(other.status).toBe(404);
  });

  it('deletes an event (204), then 410; unknown events are 404', async () => {
    const created = (
      await insert({
        start: { dateTime: '2026-01-06T10:00:00Z' },
        end: { dateTime: '2026-01-06T11:00:00Z' },
      })
    ).body as { id: string };
    const url = `/calendar/v3/calendars/primary/events/${created.id}?sendUpdates=all`;
    const first = await request(mock.app).delete(url).set('authorization', `Bearer ${token}`);
    expect(first.status).toBe(204);
    const second = await request(mock.app).delete(url).set('authorization', `Bearer ${token}`);
    expect(second.status).toBe(410);
    const unknown = await request(mock.app)
      .delete('/calendar/v3/calendars/primary/events/nothere')
      .set('authorization', `Bearer ${token}`);
    expect(unknown.status).toBe(404);
    const record = (await callLog()).find((call) => call.method === 'DELETE');
    expect(record?.detail).toEqual({
      calendarId: 'primary',
      eventId: created.id,
      sendUpdates: 'all',
    });
  });

  it('requires a calendar scope', async () => {
    const signInOnly = (await signIn('openid email')).access_token;
    const res = await request(mock.app)
      .post('/calendar/v3/freeBusy')
      .set('authorization', `Bearer ${signInOnly}`)
      .send({
        timeMin: '2026-01-05T00:00:00Z',
        timeMax: '2026-01-06T00:00:00Z',
        items: [{ id: 'primary' }],
      });
    expect(res.status).toBe(403);
  });
});

describe('failure injection (POST /__control)', () => {
  it('fails the next refresh-token grant with invalid_grant (AC7)', async () => {
    const tokens = await signIn();
    const control = await request(mock.app)
      .post('/__control')
      .send({ next: 1, fail: 'invalid_grant' });
    expect(control.status).toBe(201);
    const failed = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token ?? '',
    });
    expect(failed.status).toBe(400);
    expect((failed.body as OAuthErrorBody).error).toBe('invalid_grant');
    const ok = await exchange({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token ?? '',
    });
    expect(ok.status).toBe(200);
    expect((await callLog()).map((call) => call.injected).filter(Boolean)).toEqual([
      'invalid_grant',
    ]);
  });

  it('turns invalid_grant into 401 on API calls', async () => {
    const token = (await signIn(ALL_SCOPES)).access_token;
    await request(mock.app).post('/__control').send({ fail: 'invalid_grant', path: '/gmail' });
    const res = await request(mock.app)
      .get('/gmail/v1/users/me/history?startHistoryId=1')
      .set('authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
    expect((res.body as GoogleErrorBody).error.status).toBe('UNAUTHENTICATED');
  });

  it('injects 429 with Retry-After, 500 and 503', async () => {
    const token = (await signIn(ALL_SCOPES)).access_token;
    await request(mock.app).post('/__control').send({ fail: 429, retryAfter: 9 });
    await request(mock.app).post('/__control').send({ fail: 500 });
    await request(mock.app).post('/__control').send({ fail: 503 });
    const call = () =>
      request(mock.app)
        .post('/calendar/v3/freeBusy')
        .set('authorization', `Bearer ${token}`)
        .send({
          timeMin: '2026-01-05T00:00:00Z',
          timeMax: '2026-01-06T00:00:00Z',
          items: [{ id: 'primary' }],
        });
    const limited = await call();
    expect(limited.status).toBe(429);
    expect(limited.headers['retry-after']).toBe('9');
    expect((limited.body as GoogleErrorBody).error.errors[0]?.reason).toBe('rateLimitExceeded');
    expect((await call()).status).toBe(500);
    expect((await call()).status).toBe(503);
    expect((await call()).status).toBe(200);
  });

  it('redirects with access_denied on the consent endpoint', async () => {
    await request(mock.app).post('/__control').send({ fail: 'access_denied' });
    const params = await authorize();
    expect(params.get('error')).toBe('access_denied');
    expect(params.get('state')).toBe('state-123');
    expect(params.get('code')).toBeNull();
  });

  it('adds latency', async () => {
    await request(mock.app).post('/__control').send({ latencyMs: 120 });
    const started = performance.now();
    expect((await request(mock.app).get('/oauth2/v3/userinfo')).status).toBe(401);
    expect(performance.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('rejects invalid rules and lists pending ones', async () => {
    expect((await request(mock.app).post('/__control').send({ fail: 418 })).status).toBe(400);
    await request(mock.app).post('/__control').send({ next: 2, fail: 500, path: '/token' });
    expect((await request(mock.app).get('/__control')).body).toEqual({
      pending: [{ remaining: 2, path: '/token', effect: '500' }],
    });
  });
});

describe('seeding and reset', () => {
  it('seeds users and ready-made access tokens', async () => {
    const seeded = await request(mock.app)
      .post('/__seed')
      .send({
        users: [{ email: 'Angel@Example.test', name: 'Ann Angel', busy: [] }],
        accessTokens: [
          { token: 'seeded-token-1', email: 'angel@example.test', scopes: [SCOPE.calendar] },
        ],
      });
    expect(seeded.status).toBe(201);
    expect(seeded.body).toMatchObject({
      users: [{ email: 'angel@example.test', name: 'Ann Angel' }],
      accessTokens: 1,
    });
    const res = await request(mock.app)
      .post('/calendar/v3/freeBusy')
      .set('authorization', 'Bearer seeded-token-1')
      .send({
        timeMin: '2026-01-05T00:00:00Z',
        timeMax: '2026-01-06T00:00:00Z',
        items: [{ id: 'primary' }],
      });
    expect(res.status).toBe(200);

    const invalid = await request(mock.app)
      .post('/__seed')
      .send({ users: [{ email: 'x' }] });
    expect(invalid.status).toBe(400);
  });

  it('clears calls and all state on reset (AC8)', async () => {
    const tokens = await signIn(ALL_SCOPES);
    const sent = await request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .set('authorization', `Bearer ${tokens.access_token}`)
      .send({ raw: rawMessage({ To: INVESTOR }) });
    await request(mock.app)
      .post('/__seed')
      .send({ users: [{ email: 'temp@example.test', name: 'T' }] });
    await request(mock.app).post('/__control').send({ next: 3, fail: 500 });
    expect((await callLog()).length).toBeGreaterThan(0);

    expect((await request(mock.app).post('/__reset')).body).toEqual({ status: 'reset' });
    expect(await callLog()).toEqual([]);
    expect((await request(mock.app).get('/__control')).body).toEqual({ pending: [] });
    const state = mock.state();
    expect(state.accessTokens.size).toBe(0);
    expect(state.refreshTokens.size).toBe(0);
    expect(state.codes.size).toBe(0);
    expect(state.messages.size).toBe(0);
    expect(state.events.size).toBe(0);
    expect([...state.users.keys()]).toEqual([FOUNDER, INVESTOR]);
    expect(
      (
        await request(mock.app)
          .get(`/gmail/v1/users/me/threads/${(sent.body as { threadId: string }).threadId}`)
          .set('authorization', `Bearer ${tokens.access_token}`)
      ).status,
    ).toBe(401);
    // Counters restart, so a replayed scenario gets the same identifiers.
    expect((await authorize()).get('code')).toBe('4/0mock-code-000001');
  });

  it('records message bodies only when MOCK_RECORD_CONTENT=true', async () => {
    mock = createMockGoogle(loadConfig({ MOCK_RECORD_CONTENT: 'true' }));
    const token = (await signIn(ALL_SCOPES)).access_token;
    await request(mock.app)
      .post('/gmail/v1/users/me/messages/send')
      .set('authorization', `Bearer ${token}`)
      .send({ raw: rawMessage({ To: INVESTOR }, 'Visible body') });
    expect(JSON.stringify(await callLog())).toContain('Visible body');
  });

  it('answers unknown paths with a Google-shaped 404', async () => {
    const res = await request(mock.app).get('/drive/v3/files');
    expect(res.status).toBe(404);
    expect((res.body as GoogleErrorBody).error.status).toBe('NOT_FOUND');
  });
});
