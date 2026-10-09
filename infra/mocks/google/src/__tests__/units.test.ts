import { describe, expect, it } from 'vitest';

import { loadConfig } from '../config.js';
import { ControlState } from '../control.js';
import {
  decodeBase64Url,
  decodeEncodedWords,
  encodeBase64Url,
  headerValue,
  MimeError,
  parseAddressList,
  parseRfc2822,
} from '../mime.js';
import { base64UrlSha256, verifyPkce } from '../pkce.js';
import { GoogleState, subFromEmail } from '../state.js';
import { busyInWindow, dateToEpoch, eventTimeToEpoch, parseRfc3339, toUtcString } from '../time.js';

const VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

describe('PKCE', () => {
  it('derives the RFC 7636 appendix B challenge', () => {
    expect(base64UrlSha256(VERIFIER)).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
  });

  it('verifies S256 and plain, and rejects mismatches and malformed verifiers', () => {
    const challenge = base64UrlSha256(VERIFIER);
    expect(verifyPkce('S256', challenge, VERIFIER)).toBe(true);
    expect(verifyPkce('S256', challenge, `${VERIFIER.slice(0, -1)}x`)).toBe(false);
    expect(verifyPkce('plain', VERIFIER, VERIFIER)).toBe(true);
    expect(verifyPkce('S256', base64UrlSha256('short'), 'short')).toBe(false);
    expect(verifyPkce('plain', 'a'.repeat(129), 'a'.repeat(129))).toBe(false);
  });
});

describe('MIME', () => {
  const raw = [
    'From: Fay Founder <founder@investfund.test>',
    'To: "Investor, Ian" <investor@investfund.test>, other@example.test',
    'Subject: =?UTF-8?B?SW50cm9kdWN0aW9uOiDinJMg?=',
    ' =?UTF-8?Q?Acme_=E2=80=93_seed?=',
    'Content-Type: text/plain; charset=UTF-8',
    '',
    'Hello Ian,',
    '',
    'Body line.',
  ].join('\r\n');

  it('round-trips base64url and accepts standard base64', () => {
    const encoded = encodeBase64Url(raw);
    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeBase64Url(encoded).toString('utf8')).toBe(raw);
    expect(decodeBase64Url(Buffer.from(raw).toString('base64')).toString('utf8')).toBe(raw);
  });

  it('rejects input that is not base64url', () => {
    expect(() => decodeBase64Url('not base64!')).toThrow(MimeError);
    expect(() => decodeBase64Url('')).toThrow(MimeError);
  });

  it('parses headers (unfolding, encoded words) and the body', () => {
    const message = parseRfc2822(raw);
    expect(headerValue(message.headers, 'subject')).toBe('Introduction: ✓ Acme – seed');
    expect(headerValue(message.headers, 'TO')).toBe(
      '"Investor, Ian" <investor@investfund.test>, other@example.test',
    );
    expect(message.body).toBe('Hello Ian,\r\n\r\nBody line.');
  });

  it('parses LF-only messages and rejects malformed header lines', () => {
    expect(parseRfc2822('To: a@b.test\n\nbody').body).toBe('body');
    expect(() => parseRfc2822('Not a header\r\n\r\nbody')).toThrow(MimeError);
  });

  it('decodes Q and latin-1 encoded words', () => {
    expect(decodeEncodedWords('=?ISO-8859-1?Q?caf=E9?= time')).toBe('café time');
    expect(decodeEncodedWords('plain')).toBe('plain');
  });

  it('extracts addresses from an address list', () => {
    expect(
      parseAddressList('"Investor, Ian" <Investor@InvestFund.test>, other@example.test, nope'),
    ).toEqual(['investor@investfund.test', 'other@example.test']);
    expect(parseAddressList(undefined)).toEqual([]);
  });
});

describe('free/busy windows', () => {
  const at = (iso: string): number => parseRfc3339(iso) ?? Number.NaN;

  it('keeps overlapping blocks, clips them to the window, sorts and merges', () => {
    const blocks = [
      { start: at('2026-01-05T13:00:00Z'), end: at('2026-01-05T14:00:00Z') },
      { start: at('2026-01-05T07:00:00Z'), end: at('2026-01-05T09:30:00Z') },
      { start: at('2026-01-05T13:30:00Z'), end: at('2026-01-05T15:00:00Z') },
      { start: at('2026-01-05T18:00:00Z'), end: at('2026-01-05T19:00:00Z') },
      { start: at('2026-01-05T15:00:00Z'), end: at('2026-01-05T15:30:00Z') },
    ];
    const result = busyInWindow(blocks, at('2026-01-05T09:00:00Z'), at('2026-01-05T17:00:00Z'));
    expect(result.map((b) => [toUtcString(b.start), toUtcString(b.end)])).toEqual([
      ['2026-01-05T09:00:00Z', '2026-01-05T09:30:00Z'],
      ['2026-01-05T13:00:00Z', '2026-01-05T15:30:00Z'],
    ]);
  });

  it('excludes blocks that only touch the window edges', () => {
    const blocks = [{ start: at('2026-01-05T08:00:00Z'), end: at('2026-01-05T09:00:00Z') }];
    expect(busyInWindow(blocks, at('2026-01-05T09:00:00Z'), at('2026-01-05T10:00:00Z'))).toEqual(
      [],
    );
  });

  it('parses RFC 3339 with offsets and converts to UTC', () => {
    expect(toUtcString(at('2026-07-01T10:00:00+01:00'))).toBe('2026-07-01T09:00:00Z');
    expect(parseRfc3339('2026-07-01T10:00:00')).toBeNull();
    expect(parseRfc3339('yesterday')).toBeNull();
  });

  it('converts local times in a named time zone, including summer time', () => {
    expect(toUtcString(eventTimeToEpoch('2026-07-01T10:00:00', 'Europe/London') ?? 0)).toBe(
      '2026-07-01T09:00:00Z',
    );
    expect(toUtcString(eventTimeToEpoch('2026-01-05T10:00:00', 'Europe/London') ?? 0)).toBe(
      '2026-01-05T10:00:00Z',
    );
    expect(toUtcString(eventTimeToEpoch('2026-01-05T10:00:00', 'America/New_York') ?? 0)).toBe(
      '2026-01-05T15:00:00Z',
    );
    expect(eventTimeToEpoch('2026-01-05T10:00:00', undefined)).toBeNull();
    expect(eventTimeToEpoch('2026-01-05T10:00:00', 'Not/AZone')).toBeNull();
    expect(dateToEpoch('2026-01-05')).toBe(at('2026-01-05T00:00:00Z'));
    expect(dateToEpoch('05/01/2026')).toBeNull();
  });
});

describe('ControlState', () => {
  it('serves rules FIFO for `next` calls and honours path prefixes', () => {
    const control = new ControlState();
    control.add({ next: 1, fail: 'invalid_grant', path: '/token' });
    control.add({ next: 2, fail: 429, retryAfter: 4 });
    expect(control.take('/gmail/v1/users/me/history')).toEqual({ fail: 429, retryAfter: 4 });
    expect(control.take('/token')).toEqual({ fail: 'invalid_grant', retryAfter: 1 });
    expect(control.take('/token')).toEqual({ fail: 429, retryAfter: 4 });
    expect(control.take('/token')).toBeUndefined();
  });

  it('rejects invalid rules', () => {
    const control = new ControlState();
    expect(() => control.add({})).toThrow();
    expect(() => control.add({ fail: 418 })).toThrow();
    expect(() => control.add({ fail: 'nope' })).toThrow();
    expect(() => control.add({ fail: 500, extra: true })).toThrow();
  });
});

describe('GoogleState', () => {
  it('derives a stable 21-digit sub from the email', () => {
    expect(subFromEmail('a@b.test')).toMatch(/^1\d{20}$/);
    expect(subFromEmail('a@b.test')).toBe(subFromEmail('a@b.test'));
    expect(subFromEmail('a@b.test')).not.toBe(subFromEmail('c@b.test'));
  });

  it('issues deterministic identifiers', () => {
    const make = (): string[] => {
      const state = new GoogleState(0);
      state.seed({ users: [{ email: 'a@b.test', name: 'A' }] });
      const message = state.addMessage('a@b.test', { headers: [], body: '', labelIds: ['SENT'] });
      return [
        state.nextCode(),
        state.issueAccessToken({
          email: 'a@b.test',
          clientId: 'c',
          scopes: [],
          refreshToken: null,
        }),
        message.id,
        String(message.historyId),
        String(message.internalDate),
        state.nextEventId(),
      ];
    };
    expect(make()).toEqual(make());
  });

  it('revoking a refresh token revokes the access tokens minted from it', () => {
    const state = new GoogleState(0);
    state.seed({ users: [{ email: 'a@b.test', name: 'A' }] });
    const refresh = state.issueRefreshToken({ email: 'a@b.test', clientId: 'c', scopes: ['x'] });
    const access = state.issueAccessToken({
      email: 'a@b.test',
      clientId: 'c',
      scopes: ['x'],
      refreshToken: refresh,
    });
    expect(state.revoke(refresh)).toBe(true);
    expect(state.accessTokens.get(access)?.revoked).toBe(true);
    expect(state.revoke(refresh)).toBe(false);
  });

  it('rejects seeded tokens for unknown users', () => {
    const state = new GoogleState(0);
    expect(() =>
      state.seed({ accessTokens: [{ token: 'token-123', email: 'x@y.test', scopes: ['s'] }] }),
    ).toThrow(/unknown user/);
  });
});

describe('loadConfig', () => {
  it('applies defaults and validates MOCK_NOW', () => {
    expect(loadConfig({})).toMatchObject({
      port: 4020,
      host: '127.0.0.1',
      clientId: null,
      clientSecret: null,
      recordContent: false,
      startTime: parseRfc3339('2026-01-05T08:00:00Z'),
    });
    expect(() => loadConfig({ MOCK_NOW: 'today' })).toThrow();
  });
});
