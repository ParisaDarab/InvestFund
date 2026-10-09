/**
 * Cross-cutting API contracts (docs/API.md §1).
 *
 * Naming: every schema is a PascalCase constant with a type of the same name (`Money` and
 * `type Money`). Schemas that become OpenAPI components carry `.meta({ id })`, so any schema
 * that embeds them gets a `$ref` instead of an inline copy.
 *
 * Strictness: request schemas use `z.strictObject` (unknown fields are rejected). Response
 * schemas use `z.object` (unknown fields are stripped) so that additive API changes do not
 * break older clients. Value objects that appear in requests (`Money`) are strict.
 */
import { z } from 'zod';

// ── Primitives ──────────────────────────────────────────────────────────────

/** Resource identifier: a UUID string (the API issues UUID v7). */
export const Uuid = z.uuid().meta({
  description: 'UUID (the API issues v7).',
  example: '01928c4e-7d3a-7b2c-9f1e-3a4b5c6d7e8f',
});
export type Uuid = z.infer<typeof Uuid>;

/** ISO 8601 timestamp in UTC with the `Z` designator, for example `2026-10-08T09:30:00Z`. */
export const IsoDateTime = z.iso.datetime().meta({
  description: 'ISO 8601 date-time in UTC (`Z` designator).',
  example: '2026-10-08T09:30:00Z',
});
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** Calendar date `YYYY-MM-DD`. */
export const IsoDate = z.iso.date().meta({
  description: 'Calendar date (`YYYY-MM-DD`).',
  example: '2026-10-08',
});
export type IsoDate = z.infer<typeof IsoDate>;

// ── Money ───────────────────────────────────────────────────────────────────

/** Largest value a PostgreSQL BIGINT column can hold. */
export const MAX_AMOUNT_MINOR = 9_223_372_036_854_775_807n;

const AMOUNT_MINOR_PATTERN = /^(0|[1-9]\d*)$/;

/** Supported currencies. The MVP is UK-only. */
export const Currency = z.literal('GBP').meta({ description: 'ISO 4217 currency code.' });
export type Currency = z.infer<typeof Currency>;

/**
 * A non-negative amount in minor units (pence) as a digit string, so that BIGINT values never
 * lose precision in JSON. No sign, no leading zeros, no decimal point.
 */
export const AmountMinor = z
  .string()
  .regex(AMOUNT_MINOR_PATTERN, {
    error: 'Must be a non-negative whole number of minor units without leading zeros.',
  })
  // Zod runs every check, so guard BigInt() against values the regex already rejected.
  .refine((value) => !AMOUNT_MINOR_PATTERN.test(value) || BigInt(value) <= MAX_AMOUNT_MINOR, {
    error: 'Exceeds the maximum supported amount.',
  })
  .meta({ description: 'Amount in minor units (pence) as a digit string.', example: '2500000' });
export type AmountMinor = z.infer<typeof AmountMinor>;

/** Money value object: `{ "amountMinor": "2500000", "currency": "GBP" }` is £25,000.00. */
export const Money = z
  .strictObject({
    amountMinor: AmountMinor,
    currency: Currency,
  })
  .meta({
    id: 'Money',
    description: 'Monetary amount in minor units. Never use floating-point arithmetic on it.',
  });
export type Money = z.infer<typeof Money>;

// ── Errors (RFC 9457) ───────────────────────────────────────────────────────

/** One entry of `ProblemDetails.errors`, typically a failed validation rule. */
export const ProblemFieldError = z
  .object({
    path: z.string().meta({
      description: 'Location of the offending value, dot-separated (for example `body.email`).',
    }),
    code: z.string().meta({ description: 'Machine-readable reason (for example `too_small`).' }),
    message: z.string().meta({ description: 'Human-readable explanation, safe to display.' }),
  })
  .meta({ id: 'ProblemFieldError' });
export type ProblemFieldError = z.infer<typeof ProblemFieldError>;

/** `application/problem+json` body returned for every error response. */
export const ProblemDetails = z
  .object({
    type: z.url().meta({
      description:
        'Problem type URI: `https://investfund.local/problems/<slug>` (see `PROBLEM_TYPE_STATUS`).',
      example: 'https://investfund.local/problems/validation-error',
    }),
    title: z.string().meta({ description: 'Short, human-readable summary of the problem type.' }),
    status: z.int().min(100).max(599).meta({ description: 'HTTP status code.' }),
    detail: z.string().optional().meta({ description: 'Explanation specific to this occurrence.' }),
    instance: z.string().optional().meta({ description: 'URI reference of this occurrence.' }),
    requestId: z
      .string()
      .min(1)
      .meta({ description: 'Value of the `X-Request-Id` response header, for support.' }),
    errors: z
      .array(ProblemFieldError)
      .optional()
      .meta({ description: 'Field-level errors (validation and business-rule problems).' }),
  })
  .meta({ id: 'ProblemDetails', description: 'RFC 9457 problem details with a request ID.' });
export type ProblemDetails = z.infer<typeof ProblemDetails>;

// ── Pagination ──────────────────────────────────────────────────────────────

export const DEFAULT_PAGE_LIMIT = 20;
export const MAX_PAGE_LIMIT = 100;

/** Opaque, URL-safe cursor returned as `nextCursor` and sent back as `?cursor=`. */
export const Cursor = z
  .string()
  .min(1)
  .max(512)
  .regex(/^[A-Za-z0-9_-]+$/, { error: 'Must be an opaque base64url cursor.' })
  .meta({ description: 'Opaque cursor taken from the `nextCursor` of the previous page.' });
export type Cursor = z.infer<typeof Cursor>;

/** Query string for cursor-paginated lists: `?cursor=&limit=` (limit 1-100, default 20). */
export const CursorPageQuery = z.strictObject({
  cursor: Cursor.optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE_LIMIT)
    .default(DEFAULT_PAGE_LIMIT)
    .meta({ description: `Page size, 1-${String(MAX_PAGE_LIMIT)}.` }),
});
export type CursorPageQuery = z.infer<typeof CursorPageQuery>;

/**
 * Builds the response schema for one page of `item`: `{ data: T[], nextCursor: string | null }`.
 * Give the result its own component name, for example `cursorPage(Job).meta({ id: 'JobPage' })`.
 */
export function cursorPage<Item extends z.ZodType>(item: Item) {
  return z.object({
    data: z.array(item),
    nextCursor: Cursor.nullable().meta({ description: '`null` on the last page.' }),
  });
}
export interface CursorPage<Item> {
  data: Item[];
  nextCursor: string | null;
}

// ── Asynchronous work ───────────────────────────────────────────────────────

/** Lifecycle of a background job (DATABASE.md `JobStatus`). */
export const JobStatus = z
  .enum(['queued', 'running', 'succeeded', 'failed', 'cancelled'])
  .meta({ id: 'JobStatus' });
export type JobStatus = z.infer<typeof JobStatus>;

/** Body of a `202 Accepted` response; the `Location` header points at `/api/v1/jobs/{jobId}`. */
export const JobAccepted = z
  .object({
    jobId: Uuid,
    status: JobStatus,
  })
  .meta({ id: 'JobAccepted', description: 'A background job was accepted.' });
export type JobAccepted = z.infer<typeof JobAccepted>;

/** The resource a finished job produced. */
export const JobResult = z
  .object({
    resourceType: z.string().min(1).meta({ example: 'document_extraction' }),
    resourceId: Uuid,
  })
  .meta({ id: 'JobResult' });
export type JobResult = z.infer<typeof JobResult>;

/** Why a job failed. Never contains stack traces, document text or other sensitive data. */
export const JobError = z
  .object({
    code: z.string().min(1),
    message: z.string(),
  })
  .meta({ id: 'JobError' });
export type JobError = z.infer<typeof JobError>;

/** A background job resource, polled through `GET /api/v1/jobs/{jobId}`. */
export const Job = z
  .object({
    id: Uuid,
    type: z.string().min(1).meta({
      description: 'Job type (DATABASE.md `JobType`). Narrowed to an enum by the jobs contract.',
      example: 'document_extraction',
    }),
    status: JobStatus,
    progress: z.int().min(0).max(100).meta({ description: 'Completion percentage, 0-100.' }),
    result: JobResult.optional(),
    error: JobError.optional(),
    createdAt: IsoDateTime,
    finishedAt: IsoDateTime.nullable().meta({ description: '`null` until the job finishes.' }),
  })
  .meta({ id: 'Job' });
export type Job = z.infer<typeof Job>;

// ── Acknowledgements ────────────────────────────────────────────────────────

/** Generic `202 Accepted` body for enumeration-safe actions (register, forgot password). */
export const AcceptedMessage = z
  .object({
    message: z.string().min(1),
  })
  .meta({ id: 'AcceptedMessage' });
export type AcceptedMessage = z.infer<typeof AcceptedMessage>;
