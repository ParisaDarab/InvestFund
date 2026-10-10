/**
 * Standard problem types (docs/API.md §2). The `type` member of a `ProblemDetails` body is
 * `PROBLEM_TYPE_BASE_URI + slug`. A unit test keeps this list in sync with docs/API.md.
 */

export const PROBLEM_TYPE_BASE_URI = 'https://investfund.local/problems/';

/** Media type of every error response (RFC 9457). */
export const PROBLEM_CONTENT_TYPE = 'application/problem+json';

/** Every standard problem slug with the HTTP status it is returned with. */
export const PROBLEM_TYPE_STATUS = {
  'validation-error': 400,
  unauthenticated: 401,
  'invalid-credentials': 401,
  forbidden: 403,
  'account-suspended': 403,
  'email-not-verified': 403,
  'not-found': 404,
  conflict: 409,
  'version-conflict': 409,
  'idempotency-key-reuse': 409,
  'invalid-state': 409,
  'token-expired': 410,
  'payload-too-large': 413,
  'unsupported-media-type': 415,
  'business-rule-violation': 422,
  'quota-exceeded': 422,
  'account-locked': 423,
  'integration-required': 424,
  'rate-limited': 429,
  'internal-error': 500,
  'dependency-unavailable': 503,
} as const satisfies Record<string, number>;

export type ProblemTypeSlug = keyof typeof PROBLEM_TYPE_STATUS;

export const PROBLEM_TYPE_SLUGS = Object.keys(PROBLEM_TYPE_STATUS) as readonly ProblemTypeSlug[];

/** Full `type` URI for a slug, for example `https://investfund.local/problems/not-found`. */
export function problemTypeUri(slug: ProblemTypeSlug): string {
  return `${PROBLEM_TYPE_BASE_URI}${slug}`;
}
