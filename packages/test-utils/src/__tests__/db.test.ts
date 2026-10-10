import { describe, expect, it } from 'vitest';

import {
  databaseUrl,
  DEFAULT_TEST_SERVER_URL,
  existingServer,
  testDatabaseServerUrl,
  uniqueDatabaseName,
} from '../db.js';

describe('testDatabaseServerUrl', () => {
  it('prefers TEST_DATABASE_URL, then DATABASE_URL, then the local compose database', () => {
    expect(testDatabaseServerUrl({ TEST_DATABASE_URL: 'postgres://t', DATABASE_URL: 'x' })).toBe(
      'postgres://t',
    );
    expect(testDatabaseServerUrl({ TEST_DATABASE_URL: '', DATABASE_URL: 'postgres://d' })).toBe(
      'postgres://d',
    );
    expect(testDatabaseServerUrl({})).toBe(DEFAULT_TEST_SERVER_URL);
  });
});

describe('databaseUrl', () => {
  it('swaps the database name and drops the schema parameter', () => {
    expect(
      databaseUrl('postgresql://u:p@db:5432/investfund?schema=public&connect_timeout=5', 'test_a'),
    ).toBe('postgresql://u:p@db:5432/test_a?connect_timeout=5');
  });
});

describe('uniqueDatabaseName', () => {
  it('returns distinct, valid PostgreSQL identifiers', () => {
    const names = new Set(Array.from({ length: 50 }, () => uniqueDatabaseName('suite')));
    expect(names.size).toBe(50);
    for (const name of names) expect(name).toMatch(/^suite_[a-z0-9]+_[0-9a-f]{8}$/);
  });

  it('rejects a prefix that would make an unsafe identifier', () => {
    expect(() => uniqueDatabaseName('x"; DROP DATABASE investfund; --')).toThrow(/Invalid/);
    expect(() => uniqueDatabaseName('Upper')).toThrow(/Invalid/);
  });
});

describe('existingServer', () => {
  it('wraps a URL and releases as a no-op', async () => {
    const server = existingServer('postgres://somewhere/db');
    expect(server.url).toBe('postgres://somewhere/db');
    await expect(server.release()).resolves.toBeUndefined();
  });
});
