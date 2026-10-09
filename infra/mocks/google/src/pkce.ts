import { createHash } from 'node:crypto';

/** RFC 7636 §4.1: 43–128 characters from the unreserved set. Applies to verifiers and challenges. */
export const PKCE_VALUE = /^[A-Za-z0-9\-._~]{43,128}$/;

export type PkceMethod = 'S256' | 'plain';

export function base64UrlSha256(input: string): string {
  return createHash('sha256').update(input, 'ascii').digest('base64url');
}

/** True when `verifier` is well-formed and matches `challenge` under `method`. */
export function verifyPkce(method: PkceMethod, challenge: string, verifier: string): boolean {
  if (!PKCE_VALUE.test(verifier)) return false;
  const derived = method === 'S256' ? base64UrlSha256(verifier) : verifier;
  return derived === challenge;
}
