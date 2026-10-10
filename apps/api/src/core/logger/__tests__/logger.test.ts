import { describe, expect, it } from 'vitest';

import { captureLogs } from '../../../__tests__/support.js';
import { pathOf, resolveRequestId } from '../http-logger.js';
import { createLogger, REDACTED } from '../logger.js';

describe('createLogger redaction', () => {
  it('redacts a top-level password and a nested authorization header (AC6)', () => {
    const logs = captureLogs();
    const logger = createLogger({ level: 'info' }, logs.stream);

    logger.info({ password: 'x', headers: { authorization: 'Bearer y' } }, 'login attempt');

    const [line] = logs.lines;
    expect(line).toMatchObject({
      level: 'info',
      msg: 'login attempt',
      service: 'api',
      password: REDACTED,
      headers: { authorization: REDACTED },
    });
    expect(logs.text()).not.toContain('Bearer y');
  });

  it('redacts every sensitive key up to three levels deep', () => {
    const logs = captureLogs();
    const logger = createLogger({ level: 'info' }, logs.stream);

    logger.info({
      token: 't0',
      apiKey: 'k0',
      body: { refreshToken: 'r1', accessToken: 'a1', secret: 's1' },
      req: { headers: { cookie: 'c2', 'set-cookie': 'sc2', authorization: 'au2' } },
    });

    const text = logs.text();
    for (const value of ['t0', 'k0', 'r1', 'a1', 's1', 'c2', 'sc2', 'au2']) {
      expect(text).not.toContain(`"${value}"`);
    }
    expect(logs.lines[0]).toMatchObject({
      token: REDACTED,
      apiKey: REDACTED,
      body: { refreshToken: REDACTED, accessToken: REDACTED, secret: REDACTED },
      req: { headers: { cookie: REDACTED, 'set-cookie': REDACTED, authorization: REDACTED } },
    });
  });

  it('serialises errors with their stack', () => {
    const logs = captureLogs();
    createLogger({ level: 'info' }, logs.stream).error({ err: new Error('kaput') }, 'failed');
    expect(logs.lines[0]).toMatchObject({
      level: 'error',
      err: {
        type: 'Error',
        message: 'kaput',
        stack: expect.stringContaining('Error: kaput') as unknown,
      },
    });
  });

  it('respects the configured level', () => {
    const logs = captureLogs();
    const logger = createLogger({ level: 'warn' }, logs.stream);
    logger.info('hidden');
    logger.warn('shown');
    expect(logs.lines.map((line) => line.msg)).toEqual(['shown']);
  });
});

describe('resolveRequestId', () => {
  it('keeps a well-formed incoming ID', () => {
    expect(resolveRequestId('abc-123')).toBe('abc-123');
    expect(resolveRequestId(['first.id', 'second'])).toBe('first.id');
  });

  it('generates a UUID for missing or malformed IDs', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    for (const incoming of [undefined, '', 'has space', 'x'.repeat(129), 'new\nline', '<script>']) {
      expect(resolveRequestId(incoming)).toMatch(uuid);
    }
  });
});

describe('pathOf', () => {
  it('strips the query string and fragment', () => {
    expect(pathOf('/api/v1/x?token=secret')).toBe('/api/v1/x');
    expect(pathOf('/a#frag')).toBe('/a');
    expect(pathOf('/plain')).toBe('/plain');
    expect(pathOf(undefined)).toBe('');
  });
});
