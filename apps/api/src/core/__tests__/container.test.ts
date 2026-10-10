import { describe, expect, it, vi } from 'vitest';

import { captureLogs, testConfig } from '../../__tests__/support.js';
import { createContainer } from '../container.js';
import { MemoryRateLimitStore } from '../rateLimit/memory-store.js';
import { PostgresRateLimitStore } from '../rateLimit/postgres-store.js';

describe('createContainer: database wiring', () => {
  it('registers the db readiness check and a close hook that disconnects Prisma', async () => {
    const container = createContainer(testConfig(), { logDestination: captureLogs().stream });
    expect(container.readiness.names()).toEqual(['db', 'storage']);

    const disconnect = vi.spyOn(container.prisma, '$disconnect');
    for (const hook of container.closeHooks) await hook();
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('builds without connecting, so a down database does not stop the process starting', () => {
    expect(() =>
      createContainer(testConfig({ DATABASE_URL: 'postgresql://u:p@127.0.0.1:1/none' }), {
        logDestination: captureLogs().stream,
      }),
    ).not.toThrow();
  });
});

describe('createContainer: security wiring (P0-API-02)', () => {
  it('builds the cipher from the key ring and binds hmacIp to IP_HASH_SECRET', () => {
    const container = createContainer(testConfig(), { logDestination: captureLogs().stream });
    const { ciphertext, keyVersion } = container.cipher.encrypt('wired');
    expect(keyVersion).toBe(1);
    expect(container.cipher.decrypt(ciphertext, keyVersion)).toBe('wired');

    const other = createContainer(testConfig({ IP_HASH_SECRET: 'another-test-secret' }), {
      logDestination: captureLogs().stream,
    });
    expect(container.hashIp('203.0.113.7')).toMatch(/^[0-9a-f]{64}$/);
    expect(container.hashIp('203.0.113.7')).not.toBe(other.hashIp('203.0.113.7'));
  });

  it('uses the Postgres rate-limit store unless configured otherwise', () => {
    const postgres = createContainer(testConfig({ RATE_LIMIT_STORE: 'postgres' }), {
      logDestination: captureLogs().stream,
    });
    expect(postgres.rateLimitStore).toBeInstanceOf(PostgresRateLimitStore);
    const memory = createContainer(testConfig(), { logDestination: captureLogs().stream });
    expect(memory.rateLimitStore).toBeInstanceOf(MemoryRateLimitStore);
  });
});
