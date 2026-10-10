/**
 * One-way hashes for lookups (docs/DATABASE.md §1 "Hashes").
 *
 * - `hashToken`: SHA-256 hex of a high-entropy random token (refresh, verification, reset). Raw
 *   tokens are never stored; a lookup hashes the presented token and compares hashes.
 * - `hmacIp`: HMAC-SHA256 hex of a normalised IP address under `IP_HASH_SECRET`. IP addresses are
 *   low-entropy, so a plain hash could be reversed by enumeration; the keyed hash cannot without
 *   the secret. Used for `ip_hash` columns and rate-limit keys.
 */
import { createHash, createHmac } from 'node:crypto';

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Lower-cases, and unwraps IPv4-mapped IPv6 (`::ffff:203.0.113.7` → `203.0.113.7`). */
export function normaliseIp(ip: string): string {
  const value = ip.trim().toLowerCase();
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(value);
  if (mapped?.[1] !== undefined) return mapped[1];
  return value;
}

/** Keyed hash of any identifier (`hmacIp` uses it with an `ip:` namespace). */
export function hmacHex(secret: string, value: string): string {
  return createHmac('sha256', secret).update(value, 'utf8').digest('hex');
}

export function hmacIp(ip: string, secret: string): string {
  return hmacHex(secret, `ip:${normaliseIp(ip)}`);
}
