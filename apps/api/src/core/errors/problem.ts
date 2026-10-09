/** Builds and sends RFC 9457 `application/problem+json` bodies (shared `ProblemDetails`). */
import {
  PROBLEM_CONTENT_TYPE,
  PROBLEM_TYPE_STATUS,
  problemTypeUri,
  type ProblemDetails,
  type ProblemFieldError,
  type ProblemTypeSlug,
} from '@investfund/shared';

import type { Response } from 'express';

/** Short, stable titles per problem type. `detail` carries the occurrence-specific text. */
export const PROBLEM_TITLES = {
  'validation-error': 'Validation failed',
  unauthenticated: 'Authentication required',
  'invalid-credentials': 'Invalid credentials',
  forbidden: 'Forbidden',
  'account-suspended': 'Account suspended',
  'email-not-verified': 'Email not verified',
  'not-found': 'Not found',
  conflict: 'Conflict',
  'version-conflict': 'Version conflict',
  'idempotency-key-reuse': 'Idempotency key reused',
  'invalid-state': 'Invalid state',
  'token-expired': 'Token expired',
  'payload-too-large': 'Payload too large',
  'unsupported-media-type': 'Unsupported media type',
  'business-rule-violation': 'Business rule violation',
  'quota-exceeded': 'Quota exceeded',
  'account-locked': 'Account locked',
  'integration-required': 'Integration required',
  'rate-limited': 'Too many requests',
  'internal-error': 'Internal server error',
  'dependency-unavailable': 'Service unavailable',
} as const satisfies Record<ProblemTypeSlug, string>;

/** Generic `detail` of the `internal-error` problem: never the internal message or stack. */
export const INTERNAL_PROBLEM_DETAIL =
  'An unexpected error occurred. Quote the request ID if you contact support.';

export interface ProblemInput {
  readonly detail?: string | undefined;
  readonly instance?: string | undefined;
  readonly requestId: string;
  readonly errors?: readonly ProblemFieldError[] | undefined;
}

/** A standard problem (docs/API.md §2). Unexpected errors use `internal-error`. */
export function buildProblem(slug: ProblemTypeSlug, input: ProblemInput): ProblemDetails {
  const problem: ProblemDetails = {
    type: problemTypeUri(slug),
    title: PROBLEM_TITLES[slug],
    status: PROBLEM_TYPE_STATUS[slug],
    requestId: input.requestId,
  };
  if (input.detail !== undefined) problem.detail = input.detail;
  if (input.instance !== undefined) problem.instance = input.instance;
  if (input.errors !== undefined && input.errors.length > 0) problem.errors = [...input.errors];
  return problem;
}

export function sendProblem(res: Response, problem: ProblemDetails): void {
  res.status(problem.status).type(PROBLEM_CONTENT_TYPE).json(problem);
}
