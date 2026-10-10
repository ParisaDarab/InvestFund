import { ProblemDetails } from '@investfund/shared';
import type { ProblemFieldError } from '@investfund/shared';

import type { z } from 'zod';

import { getPublicEnv } from '@/lib/env';

/**
 * Typed fetch client for the InvestFund REST API (docs/API.md §1-§2).
 *
 * Every call goes through {@link apiFetch}: it builds the URL from `NEXT_PUBLIC_API_URL`, sends and
 * receives JSON, parses success bodies with the shared Zod response schema and turns every failure
 * into an {@link ApiError}. The module has no browser-only or server-only imports, so Server and
 * Client Components can both use it.
 *
 * Never log tokens or response bodies here: bodies can contain personal data.
 */

/** Versioned API prefix. System endpoints (`/health/*`) live outside it: pass `prefix: false`. */
export const API_VERSION_PREFIX = '/api/v1';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * - `problem`: an error status with a valid `application/problem+json` body (`problem` is set).
 * - `http`: an error status without a usable problem body.
 * - `contract`: a success status whose body does not match the response schema.
 * - `network`: no response at all (offline, DNS, CORS, connection refused).
 */
export type ApiErrorKind = 'http' | 'problem' | 'contract' | 'network';

/** A response-schema violation: where and why, never the offending value. */
export interface ContractIssue {
  path: string;
  code: string;
  message: string;
}

export interface ApiErrorInit {
  kind: ApiErrorKind;
  message: string;
  method: HttpMethod;
  /** Request path without the query string (it may carry personal data). */
  endpoint: string;
  status?: number | undefined;
  problem?: ProblemDetails | undefined;
  retryAfterSeconds?: number | undefined;
  requestId?: string | undefined;
  issues?: readonly ContractIssue[] | undefined;
  cause?: unknown;
}

export class ApiError extends Error {
  override readonly name = 'ApiError';
  readonly kind: ApiErrorKind;
  readonly method: HttpMethod;
  readonly endpoint: string;
  /** HTTP status, `undefined` for network errors. */
  readonly status: number | undefined;
  /** Parsed problem+json body (`kind === 'problem'` only). */
  readonly problem: ProblemDetails | undefined;
  /** From the `Retry-After` header (seconds or HTTP date), on 429/423/503 responses. */
  readonly retryAfterSeconds: number | undefined;
  /** `X-Request-Id` of the response, for support. */
  readonly requestId: string | undefined;
  /** Schema violations (`kind === 'contract'` only). */
  readonly issues: readonly ContractIssue[];

  constructor(init: ApiErrorInit) {
    super(init.message, init.cause === undefined ? undefined : { cause: init.cause });
    this.kind = init.kind;
    this.method = init.method;
    this.endpoint = init.endpoint;
    this.status = init.status;
    this.problem = init.problem;
    this.retryAfterSeconds = init.retryAfterSeconds;
    this.requestId = init.requestId ?? init.problem?.requestId;
    this.issues = init.issues ?? [];
  }

  /** Field-level errors (`problem.errors`), empty when there are none. */
  get fieldErrors(): readonly ProblemFieldError[] {
    return this.problem?.errors ?? [];
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

// ── Access token ─────────────────────────────────────────────────────────────

export type AccessToken = string | null | undefined;
export type AccessTokenProvider = () => AccessToken | Promise<AccessToken>;

const noAccessToken: AccessTokenProvider = () => null;
let accessTokenProvider: AccessTokenProvider = noAccessToken;

/**
 * Registers where the in-memory access token comes from (wired up by the auth session in P1).
 * Pass `null` to remove it. The provider is only consulted in the browser: on the server this
 * module is shared by every request, so a module-level token would leak between users.
 */
export function setAccessTokenProvider(provider: AccessTokenProvider | null): void {
  accessTokenProvider = provider ?? noAccessToken;
}

async function currentAccessToken(): Promise<AccessToken> {
  if (typeof window === 'undefined') return null;
  return accessTokenProvider();
}

// ── URLs ─────────────────────────────────────────────────────────────────────

export interface ApiUrlOptions {
  /** Prepend {@link API_VERSION_PREFIX} (default `true`). `false` for `/health/*`. */
  prefix?: boolean | undefined;
}

/** Absolute API URL for `path` (which must start with `/`). */
export function buildApiUrl(path: string, { prefix = true }: ApiUrlOptions = {}): string {
  if (!path.startsWith('/')) {
    throw new TypeError(`API paths must start with "/" (got "${path}")`);
  }
  const base = getPublicEnv().NEXT_PUBLIC_API_URL.replace(/\/+$/, '');
  return `${base}${prefix ? API_VERSION_PREFIX : ''}${path}`;
}

/** The refresh-token cookie is scoped to `/api/v1/auth`, so only those calls send credentials. */
function isAuthPath(endpoint: string, prefix: boolean): boolean {
  return prefix && (endpoint === '/auth' || endpoint.startsWith('/auth/'));
}

function withoutQuery(path: string): string {
  const end = path.search(/[?#]/);
  return end === -1 ? path : path.slice(0, end);
}

// ── Headers ──────────────────────────────────────────────────────────────────

const IMF_FIXDATE = /^[A-Z][a-z]{2}, \d{2} [A-Z][a-z]{2} \d{4} \d{2}:\d{2}:\d{2} GMT$/;

/**
 * `Retry-After` as whole seconds: either delta-seconds (`30`) or an HTTP date. Returns
 * `undefined` when the header is missing or malformed.
 */
export function parseRetryAfter(
  value: string | null | undefined,
  now: number = Date.now(),
): number | undefined {
  if (value === null || value === undefined) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  // IMF-fixdate only (RFC 9110 §5.6.7); Date.parse alone accepts almost anything ("-5").
  if (!IMF_FIXDATE.test(trimmed)) return undefined;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - now) / 1000));
}

// ── apiFetch ─────────────────────────────────────────────────────────────────

export interface ApiFetchOptions {
  method?: HttpMethod | undefined;
  /** Serialised as JSON. */
  body?: unknown;
  /** Extra request headers, for example `Idempotency-Key`. */
  headers?: Readonly<Record<string, string>> | undefined;
  signal?: AbortSignal | undefined;
  /** See {@link ApiUrlOptions.prefix}. */
  prefix?: boolean | undefined;
  /**
   * Non-2xx statuses whose body is a regular response for this endpoint, parsed with the schema
   * instead of being treated as an error (`GET /health/ready` answers `503 HealthReport`).
   */
  acceptStatuses?: readonly number[] | undefined;
}

export interface ApiFetchSchemaOptions<Schema extends z.ZodType> extends ApiFetchOptions {
  /** Shared Zod response schema from `@investfund/shared`. */
  schema: Schema;
}

/**
 * Calls the API and returns the body parsed with `schema` (or `undefined` without a schema).
 *
 * @throws {ApiError} for every failure except cancellation: an aborted request rethrows the
 * original `AbortError` so TanStack Query can tell cancellation from failure.
 */
export function apiFetch<Schema extends z.ZodType>(
  path: string,
  options: ApiFetchSchemaOptions<Schema>,
): Promise<z.output<Schema>>;
export function apiFetch(path: string, options?: ApiFetchOptions): Promise<undefined>;
export async function apiFetch(
  path: string,
  options: ApiFetchOptions & { schema?: z.ZodType | undefined } = {},
): Promise<unknown> {
  const { method = 'GET', body, schema, signal, prefix = true, acceptStatuses = [] } = options;
  const endpoint = withoutQuery(path);
  const context = { method, endpoint };

  const headers = new Headers(options.headers);
  headers.set('Accept', 'application/json, application/problem+json');
  if (body !== undefined) headers.set('Content-Type', 'application/json');
  const token = await currentAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(buildApiUrl(path, { prefix }), {
      method,
      headers,
      body: body === undefined ? null : JSON.stringify(body),
      credentials: isAuthPath(endpoint, prefix) ? 'include' : 'omit',
      signal: signal ?? null,
    });
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw new ApiError({
      ...context,
      kind: 'network',
      message: `Network error calling ${method} ${endpoint}`,
      cause,
    });
  }

  if (!response.ok && !acceptStatuses.includes(response.status)) {
    throw await toHttpError(response, context, signal);
  }

  if (schema === undefined) {
    discardBody(response);
    return undefined;
  }

  let json: unknown;
  try {
    json = response.status === 204 ? undefined : await response.json();
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw reportContractViolation(
      new ApiError({
        ...context,
        kind: 'contract',
        status: response.status,
        message: `Response from ${method} ${endpoint} is not valid JSON`,
        issues: [{ path: '', code: 'invalid_json', message: 'Body is not valid JSON' }],
        requestId: response.headers.get('X-Request-Id') ?? undefined,
      }),
    );
  }

  const result = schema.safeParse(json);
  if (result.success) return result.data;

  throw reportContractViolation(
    new ApiError({
      ...context,
      kind: 'contract',
      status: response.status,
      message: `Response from ${method} ${endpoint} does not match the expected schema`,
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join('.'),
        code: issue.code,
        message: issue.message,
      })),
      requestId: response.headers.get('X-Request-Id') ?? undefined,
    }),
  );
}

async function toHttpError(
  response: Response,
  context: { method: HttpMethod; endpoint: string },
  signal: AbortSignal | undefined,
): Promise<ApiError> {
  const common = {
    ...context,
    status: response.status,
    retryAfterSeconds: parseRetryAfter(response.headers.get('Retry-After')),
    requestId: response.headers.get('X-Request-Id') ?? undefined,
  };

  const contentType = response.headers.get('Content-Type') ?? '';
  if (contentType.includes('json')) {
    try {
      const problem = ProblemDetails.safeParse(await response.json());
      if (problem.success) {
        return new ApiError({
          ...common,
          kind: 'problem',
          problem: problem.data,
          message: problem.data.title,
        });
      }
    } catch (cause) {
      if (signal?.aborted) throw cause;
      // Not JSON after all: fall through to a plain HTTP error.
    }
  } else {
    discardBody(response);
  }

  return new ApiError({
    ...common,
    kind: 'http',
    message: `${context.method} ${context.endpoint} failed with status ${String(response.status)}`,
  });
}

/** Releases an unread body without waiting (an awaited cancel can stall on some fetch stacks). */
function discardBody(response: Response): void {
  response.body?.cancel().catch(() => undefined);
}

/**
 * Contract violations are bugs (the API and the shared schema disagree), so they are logged in
 * development. Only the endpoint and the schema issues are logged, never the body or headers.
 */
function reportContractViolation(error: ApiError): ApiError {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[api] ${error.message}`, error.issues);
  }
  return error;
}
