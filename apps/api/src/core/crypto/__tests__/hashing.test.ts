import { describe, expect, it } from 'vitest';

import { hashToken, hmacHex, hmacIp, normaliseIp } from '../hashing.js';

describe('hashToken', () => {
  it('is SHA-256 hex (known vector) and fits char(64)', () => {
    expect(hashToken('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
    expect(hashToken('a-random-refresh-token')).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is deterministic and distinguishes tokens', () => {
    expect(hashToken('t1')).toBe(hashToken('t1'));
    expect(hashToken('t1')).not.toBe(hashToken('t2'));
  });
});

describe('hmacIp', () => {
  const SECRET = 'test-only-ip-secret';

  it('is a keyed HMAC-SHA256 hex that does not contain the address', () => {
    const hash = hmacIp('203.0.113.7', SECRET);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    expect(hash).not.toContain('203');
    expect(hash).toBe(hmacIp('203.0.113.7', SECRET));
    expect(hash).not.toBe(hmacIp('203.0.113.8', SECRET));
    expect(hash).not.toBe(hmacIp('203.0.113.7', 'another-secret'));
  });

  it('treats IPv4-mapped IPv6 and case variants as the same address', () => {
    expect(hmacIp('::ffff:203.0.113.7', SECRET)).toBe(hmacIp('203.0.113.7', SECRET));
    expect(hmacIp('2001:DB8::1', SECRET)).toBe(hmacIp('2001:db8::1', SECRET));
  });

  it('namespaces addresses so they never collide with other subjects', () => {
    expect(hmacIp('203.0.113.7', SECRET)).toBe(hmacHex(SECRET, 'ip:203.0.113.7'));
    expect(hmacIp('203.0.113.7', SECRET)).not.toBe(hmacHex(SECRET, '203.0.113.7'));
  });

  it('normalises without changing other values', () => {
    expect(normaliseIp(' ::FFFF:10.0.0.1 ')).toBe('10.0.0.1');
    expect(normaliseIp('fe80::1')).toBe('fe80::1');
    expect(normaliseIp('unknown')).toBe('unknown');
  });
});
