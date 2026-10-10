/**
 * Typed domain errors. Services throw these; the central error handler maps them to
 * RFC 9457 problem+json using the standard problem types of docs/API.md §2.
 *
 * `detail` must be safe to show to the caller: never include secrets, tokens, document text
 * or another user's personal data in it.
 */
import {
  PROBLEM_TYPE_STATUS,
  type ProblemFieldError,
  type ProblemTypeSlug,
} from '@investfund/shared';

export interface DomainErrorOptions {
  /** Field-level errors, returned as `errors[]`. */
  readonly errors?: readonly ProblemFieldError[];
  /** The underlying error, kept for logs only (never serialised into the response). */
  readonly cause?: unknown;
}

export abstract class DomainError extends Error {
  /** Problem type slug: `type` is `https://investfund.local/problems/<slug>`. */
  readonly slug: ProblemTypeSlug;
  readonly status: number;
  readonly errors: readonly ProblemFieldError[] | undefined;
  /** Extra response headers (for example `Retry-After`). */
  readonly headers: Readonly<Record<string, string>>;

  protected constructor(
    slug: ProblemTypeSlug,
    detail: string,
    options: DomainErrorOptions & { headers?: Record<string, string> } = {},
  ) {
    super(detail, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.slug = slug;
    this.status = PROBLEM_TYPE_STATUS[slug];
    this.errors = options.errors;
    this.headers = options.headers ?? {};
  }
}

/** 400 `validation-error`: the request does not match its schema. */
export class ValidationError extends DomainError {
  constructor(detail = 'The request is invalid.', options: DomainErrorOptions = {}) {
    super('validation-error', detail, options);
  }
}

/**
 * 401 `unauthenticated`: the access token is missing, malformed, wrongly signed or expired.
 * Adds `WWW-Authenticate: Bearer` (RFC 6750), with `error="invalid_token"` when a token was sent.
 */
export class UnauthenticatedError extends DomainError {
  constructor(
    detail = 'Authentication is required.',
    options: DomainErrorOptions & { invalidToken?: boolean } = {},
  ) {
    super('unauthenticated', detail, {
      ...options,
      headers: {
        'WWW-Authenticate':
          options.invalidToken === true ? 'Bearer error="invalid_token"' : 'Bearer',
      },
    });
  }
}

/** 404 `not-found`. Also used when the caller may not know that the resource exists. */
export class NotFoundError extends DomainError {
  constructor(detail = 'The resource was not found.', options: DomainErrorOptions = {}) {
    super('not-found', detail, options);
  }
}

export type ForbiddenSlug = Extract<
  ProblemTypeSlug,
  'forbidden' | 'account-suspended' | 'email-not-verified'
>;

/** 403: authenticated, but the role or account state does not allow the action. */
export class ForbiddenError extends DomainError {
  constructor(
    detail = 'You are not allowed to perform this action.',
    options: DomainErrorOptions & { slug?: ForbiddenSlug } = {},
  ) {
    super(options.slug ?? 'forbidden', detail, options);
  }
}

/** 413 `payload-too-large`: a body or upload exceeds its size limit. */
export class PayloadTooLargeError extends DomainError {
  constructor(detail = 'The payload is too large.', options: DomainErrorOptions = {}) {
    super('payload-too-large', detail, options);
  }
}

export type ConflictSlug = Extract<
  ProblemTypeSlug,
  'conflict' | 'version-conflict' | 'idempotency-key-reuse' | 'invalid-state'
>;

/** 409: the request conflicts with the current state of the resource. */
export class ConflictError extends DomainError {
  constructor(
    detail = 'The request conflicts with the current state of the resource.',
    options: DomainErrorOptions & { slug?: ConflictSlug } = {},
  ) {
    super(options.slug ?? 'conflict', detail, options);
  }
}

export type BusinessRuleSlug = Extract<
  ProblemTypeSlug,
  'business-rule-violation' | 'quota-exceeded'
>;

/** 422: the request is well formed but breaks a business rule. */
export class BusinessRuleError extends DomainError {
  constructor(detail: string, options: DomainErrorOptions & { slug?: BusinessRuleSlug } = {}) {
    super(options.slug ?? 'business-rule-violation', detail, options);
  }
}

/** 429 `rate-limited`. `retryAfterSeconds` becomes the `Retry-After` header. */
export class RateLimitError extends DomainError {
  readonly retryAfterSeconds: number | undefined;

  constructor(
    detail = 'Too many requests. Try again later.',
    options: DomainErrorOptions & { retryAfterSeconds?: number } = {},
  ) {
    const seconds =
      options.retryAfterSeconds === undefined
        ? undefined
        : Math.max(1, Math.ceil(options.retryAfterSeconds));
    super(
      'rate-limited',
      detail,
      seconds === undefined ? options : { ...options, headers: { 'Retry-After': String(seconds) } },
    );
    this.retryAfterSeconds = seconds;
  }
}

/** 503 `dependency-unavailable`: a database, queue or external API could not be reached. */
export class DependencyUnavailableError extends DomainError {
  constructor(
    detail = 'A required service is temporarily unavailable. Try again later.',
    options: DomainErrorOptions = {},
  ) {
    super('dependency-unavailable', detail, options);
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError;
}
