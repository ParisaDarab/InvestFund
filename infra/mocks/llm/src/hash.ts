import { createHash } from 'node:crypto';

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/**
 * Canonical JSON: object keys sorted by UTF-16 code units (recursively), no whitespace,
 * `undefined` members dropped. For the values prompt variables use (strings, finite numbers,
 * booleans, null, arrays, objects) this is the RFC 8785 (JCS) serialisation, so an adapter can
 * compute the same hash with any JCS implementation.
 */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, member]) => member !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, member]) => `${JSON.stringify(key)}:${canonicalJson(member)}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonicalJson: non-finite numbers are not valid JSON');
  }
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) {
    throw new TypeError(`canonicalJson: ${typeof value} is not a JSON value`);
  }
  return encoded;
}

/** The variables hash used to select a fixture: `sha256(canonicalJson(vars))`, lowercase hex. */
export function varsHash(vars: unknown): string {
  return sha256Hex(canonicalJson(vars));
}
