import { describe, expect, it } from 'vitest';

import { newId, UuidV7Generator } from '../uuid-v7.js';

/** RFC 9562 UUID v7: version nibble 7, variant bits 10 (8, 9, a or b). */
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function timestampOf(id: string): number {
  return Number.parseInt(id.replaceAll('-', '').slice(0, 12), 16);
}

/** The 42-bit counter: 12 bits of rand_a and the top 30 bits of rand_b. */
function counterOf(id: string): number {
  const hex = id.replaceAll('-', '');
  const randA = Number.parseInt(hex.slice(13, 16), 16);
  const randB30 = Number.parseInt(hex.slice(16, 24), 16) & 0x3fffffff;
  return randA * 2 ** 30 + randB30;
}

const zeros = (bytes: Uint8Array) => {
  bytes.fill(0);
};
const ones = (bytes: Uint8Array) => {
  bytes.fill(0xff);
};

describe('newId (UUID v7)', () => {
  it('returns a lower-case RFC 9562 version 7 UUID', () => {
    const id = newId();
    expect(id).toMatch(UUID_V7);
    expect(id).toHaveLength(36);
  });

  it('encodes the current Unix time in milliseconds in the first 48 bits', () => {
    const before = Date.now();
    const id = newId();
    const after = Date.now();
    expect(timestampOf(id)).toBeGreaterThanOrEqual(before);
    expect(timestampOf(id)).toBeLessThanOrEqual(after + 1);
  });

  it('generates 1 000 valid, unique IDs that sort in creation order (AC4)', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    for (const id of ids) expect(id).toMatch(UUID_V7);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
  });
});

describe('UuidV7Generator', () => {
  it('encodes a fixed timestamp exactly', () => {
    const id = new UuidV7Generator({ now: () => 0x0123_4567_89ab, random: zeros }).next();
    expect(id).toBe('01234567-89ab-7000-8000-000000000000');
  });

  it('increments the counter within the same millisecond', () => {
    const generator = new UuidV7Generator({ now: () => 1_700_000_000_000, random: zeros });
    const ids = Array.from({ length: 5 }, () => generator.next());
    expect(ids.map(counterOf)).toEqual([0, 1, 2, 3, 4]);
    expect([...ids].sort()).toEqual(ids);
  });

  it('carries the counter from rand_b into rand_a', () => {
    let calls = 0;
    // Seed just below the 30-bit boundary: 0x3fffffff from the 6 seed bytes.
    const generator = new UuidV7Generator({
      now: () => 1_000,
      random: (bytes) => {
        bytes.fill(0);
        if (calls++ === 0) bytes.set([0, 0, 0x3f, 0xff, 0xff, 0xff]);
      },
    });
    const first = generator.next();
    const second = generator.next();
    expect(counterOf(first)).toBe(2 ** 30 - 1);
    expect(counterOf(second)).toBe(2 ** 30);
    expect(second > first).toBe(true);
    expect(second).toMatch(UUID_V7);
  });

  it('seeds a new millisecond with at most 41 random bits', () => {
    const id = new UuidV7Generator({ now: () => 5_000, random: ones }).next();
    expect(id).toMatch(UUID_V7);
    expect(counterOf(id)).toBe(2 ** 41 - 1);
    expect(id.endsWith('ffffffff')).toBe(true);
  });

  it('keeps the order when the clock goes backwards', () => {
    const times = [10_000, 9_000, 9_500];
    const generator = new UuidV7Generator({ now: () => times.shift() ?? 0, random: zeros });
    const ids = [generator.next(), generator.next(), generator.next()];
    expect(ids.map(timestampOf)).toEqual([10_000, 10_000, 10_000]);
    expect([...ids].sort()).toEqual(ids);
  });

  it('keeps headroom after a maximal seed', () => {
    const generator = new UuidV7Generator({ now: () => 42, random: ones });
    const a = generator.next();
    const b = generator.next();
    expect(timestampOf(b)).toBe(42);
    expect(counterOf(b)).toBe(counterOf(a) + 1);
  });

  it('advances the timestamp by 1 ms when the counter overflows', () => {
    const generator = new UuidV7Generator({ now: () => 42, random: zeros });
    generator.next();
    // Reaching 2^42 increments takes too long, so jump the private counter to its maximum.
    (generator as unknown as { counter: number }).counter = 2 ** 42 - 1;
    const id = generator.next();
    expect(timestampOf(id)).toBe(43);
    expect(counterOf(id)).toBe(0);
    expect(id).toMatch(UUID_V7);
  });

  it('rejects timestamps beyond 48 bits', () => {
    const generator = new UuidV7Generator({ now: () => 2 ** 48, random: zeros });
    expect(() => generator.next()).toThrow(RangeError);
  });
});
