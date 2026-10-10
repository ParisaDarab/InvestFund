import { createHash } from 'node:crypto';

const MAX_DIMENSIONS = 8192;

/**
 * Deterministic unit-length embedding for `input`.
 *
 * A xoshiro128** generator is seeded with the first 128 bits of `sha256(input)` and fills the
 * vector with values in [-1, 1), which are then L2-normalised. Values are rounded to float32 so
 * the `float` and `base64` encodings carry exactly the same numbers.
 */
export function embed(input: string, dimensions: number): number[] {
  if (!Number.isInteger(dimensions) || dimensions < 1 || dimensions > MAX_DIMENSIONS) {
    throw new RangeError(`dimensions must be an integer in 1..${String(MAX_DIMENSIONS)}`);
  }
  const seed = createHash('sha256').update(input, 'utf8').digest();
  let s0 = seed.readUInt32LE(0);
  let s1 = seed.readUInt32LE(4);
  let s2 = seed.readUInt32LE(8);
  let s3 = seed.readUInt32LE(12);
  if ((s0 | s1 | s2 | s3) === 0) s0 = 1;

  const rotl = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;
  const raw = new Array<number>(dimensions);
  let sumOfSquares = 0;
  for (let i = 0; i < dimensions; i += 1) {
    const result = Math.imul(rotl(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
    const t = (s1 << 9) >>> 0;
    s2 = (s2 ^ s0) >>> 0;
    s3 = (s3 ^ s1) >>> 0;
    s1 = (s1 ^ s2) >>> 0;
    s0 = (s0 ^ s3) >>> 0;
    s2 = (s2 ^ t) >>> 0;
    s3 = rotl(s3, 11);
    const value = (result / 2 ** 32) * 2 - 1;
    raw[i] = value;
    sumOfSquares += value * value;
  }
  const norm = Math.sqrt(sumOfSquares) || 1;
  return Array.from(Float32Array.from(raw, (value) => value / norm));
}

/** OpenAI `encoding_format: "base64"`: little-endian float32 bytes, base64-encoded. */
export function toBase64(vector: readonly number[]): string {
  const floats = Float32Array.from(vector);
  return Buffer.from(floats.buffer, floats.byteOffset, floats.byteLength).toString('base64');
}

/** Dimension precedence: request `dimensions`, then the model mapping, then the default. */
export function resolveDimensions(
  model: string,
  requested: number | undefined,
  modelDimensions: Readonly<Record<string, number>>,
  defaultDimensions: number,
): number {
  return requested ?? modelDimensions[model] ?? defaultDimensions;
}
