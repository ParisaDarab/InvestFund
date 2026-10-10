/**
 * UUID version 7 (RFC 9562 §5.7), generated in the app (docs/DATABASE.md, decision D5).
 *
 * Layout: 48-bit Unix timestamp in milliseconds, version `0111`, then a 42-bit counter spread over
 * `rand_a` (12 bits) and the top of `rand_b` (30 bits), the variant `10`, and 32 random bits.
 * This is RFC 9562 §6.2 method 1 (fixed-length dedicated counter):
 * - a new millisecond seeds the counter with 41 random bits (the top bit stays clear, leaving at
 *   least 2^41 increments of headroom);
 * - within the same millisecond the counter increments, so IDs from one process sort in creation
 *   order (lexicographically and as PostgreSQL `uuid` values);
 * - if the clock goes backwards, the last timestamp is reused; on counter overflow the timestamp
 *   is advanced by 1 ms. Either way the order is preserved.
 *
 * Prisma 6 can also generate v7 IDs (`@default(uuid(7))`), but only for writes made through the
 * Prisma Client and without a documented monotonic guarantee, so `newId()` is the source of IDs.
 */
import { randomFillSync } from 'node:crypto';

const COUNTER_BITS = 42;
const COUNTER_MAX = 2 ** COUNTER_BITS - 1;
const COUNTER_SEED_RANGE = 2 ** (COUNTER_BITS - 1);
const LOW_COUNTER_RANGE = 2 ** 30;
const MAX_TIMESTAMP = 2 ** 48 - 1;

/** Fills `bytes` with cryptographically secure random values. */
export type RandomFill = (bytes: Uint8Array) => void;

export interface UuidV7Options {
  /** Milliseconds since the Unix epoch. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Defaults to `crypto.randomFillSync`. */
  readonly random?: RandomFill;
}

export class UuidV7Generator {
  private readonly now: () => number;
  private readonly random: RandomFill;
  private lastTimestamp = -1;
  private counter = 0;
  /** Scratch buffer: 6 bytes for a counter seed, 4 bytes for the random tail. */
  private readonly entropy = new Uint8Array(10);

  constructor(options: UuidV7Options = {}) {
    this.now = options.now ?? Date.now;
    this.random = options.random ?? ((bytes) => randomFillSync(bytes));
  }

  next(): string {
    this.random(this.entropy);
    const now = Math.floor(this.now());
    if (now > this.lastTimestamp) {
      this.lastTimestamp = now;
      this.counter = this.seedCounter();
    } else if (this.counter < COUNTER_MAX) {
      this.counter += 1;
    } else {
      this.lastTimestamp += 1;
      this.counter = this.seedCounter();
    }
    if (this.lastTimestamp > MAX_TIMESTAMP || this.lastTimestamp < 0) {
      throw new RangeError('UUID v7 timestamp out of range');
    }

    const bytes = new Uint8Array(16);
    const timestamp = this.lastTimestamp;
    const high = Math.floor(timestamp / 2 ** 16);
    const low = timestamp % 2 ** 16;
    bytes[0] = (high >>> 24) & 0xff;
    bytes[1] = (high >>> 16) & 0xff;
    bytes[2] = (high >>> 8) & 0xff;
    bytes[3] = high & 0xff;
    bytes[4] = (low >>> 8) & 0xff;
    bytes[5] = low & 0xff;

    const counterHigh = Math.floor(this.counter / LOW_COUNTER_RANGE); // 12 bits → rand_a
    const counterLow = this.counter % LOW_COUNTER_RANGE; // 30 bits → top of rand_b
    bytes[6] = 0x70 | ((counterHigh >>> 8) & 0x0f);
    bytes[7] = counterHigh & 0xff;
    bytes[8] = 0x80 | ((counterLow >>> 24) & 0x3f);
    bytes[9] = (counterLow >>> 16) & 0xff;
    bytes[10] = (counterLow >>> 8) & 0xff;
    bytes[11] = counterLow & 0xff;
    bytes.set(this.entropy.subarray(6, 10), 12);

    return format(bytes);
  }

  /** 41 random bits from the first 6 entropy bytes. */
  private seedCounter(): number {
    let value = 0;
    for (let i = 0; i < 6; i += 1) value = value * 256 + (this.entropy[i] ?? 0);
    return value % COUNTER_SEED_RANGE;
  }
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function format(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < 16; i += 1) {
    if (i === 4 || i === 6 || i === 8 || i === 10) out += '-';
    out += HEX[bytes[i] ?? 0] ?? '00';
  }
  return out;
}

const defaultGenerator = new UuidV7Generator();

/** A new UUID v7 string (lower-case, hyphenated). Monotonic within this process. */
export function newId(): string {
  return defaultGenerator.next();
}
