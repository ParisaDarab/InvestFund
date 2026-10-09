import { describe, expect, it } from 'vitest';

import { formatMoney, fromMinor, toMinor } from '../money.js';

/** Deterministic PRNG (mulberry32) so the property test is reproducible. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** A canonical two-decimal amount string: no leading zeros, up to 15 integer digits. */
function randomTwoDecimalAmount(random: () => number): string {
  const digit = () => String(Math.floor(random() * 10));
  const integerDigits = 1 + Math.floor(random() * 15);
  let whole = String(1 + Math.floor(random() * 9));
  for (let i = 1; i < integerDigits; i += 1) whole += digit();
  if (random() < 0.15) whole = '0';
  return `${whole}.${digit()}${digit()}`;
}

describe('toMinor', () => {
  it.each([
    ['1250.50', '125050'],
    ['1250.5', '125050'],
    ['1250', '125000'],
    ['0.05', '5'],
    ['0.5', '50'],
    ['0', '0'],
    ['0.00', '0'],
    ['92233720368547758.07', '9223372036854775807'],
  ])('converts %s to %s', (major, minor) => {
    expect(toMinor(major)).toBe(minor);
  });

  it.each(['', '-1', '1.234', '1,250.50', '01.00', '.50', '1.', 'abc', ' 1.00', '1e3'])(
    'rejects %j',
    (major) => {
      expect(() => toMinor(major)).toThrow(RangeError);
    },
  );

  it('rejects an amount beyond the BIGINT range', () => {
    expect(() => toMinor('92233720368547758.08')).toThrow(RangeError);
  });

  it('round-trips 1 000 random two-decimal amounts exactly', () => {
    const random = mulberry32(20261008);
    for (let i = 0; i < 1000; i += 1) {
      const major = randomTwoDecimalAmount(random);
      const minor = toMinor(major);
      expect(minor).toMatch(/^(0|[1-9]\d*)$/);
      expect(fromMinor(minor)).toBe(major);
    }
  });
});

describe('fromMinor', () => {
  it.each([
    ['125050', '1250.50'],
    ['5', '0.05'],
    ['50', '0.50'],
    ['0', '0.00'],
    ['9223372036854775807', '92233720368547758.07'],
  ])('converts %s to %s', (minor, major) => {
    expect(fromMinor(minor)).toBe(major);
  });

  it.each(['-1', '1.5', '007', ''])('rejects %j', (minor) => {
    expect(() => fromMinor(minor)).toThrow(RangeError);
  });
});

describe('formatMoney', () => {
  it('formats GBP for en-GB', () => {
    expect(formatMoney({ amountMinor: '125050', currency: 'GBP' }, 'en-GB')).toBe('£1,250.50');
    expect(formatMoney({ amountMinor: '125050', currency: 'GBP' })).toBe('£1,250.50');
    expect(formatMoney({ amountMinor: '5', currency: 'GBP' })).toBe('£0.05');
    expect(formatMoney({ amountMinor: '0', currency: 'GBP' })).toBe('£0.00');
  });

  it('formats amounts beyond float precision exactly', () => {
    expect(formatMoney({ amountMinor: '9223372036854775807', currency: 'GBP' })).toBe(
      '£92,233,720,368,547,758.07',
    );
  });

  it('rejects an invalid amount', () => {
    expect(() => formatMoney({ amountMinor: '-100', currency: 'GBP' })).toThrow(RangeError);
  });
});
