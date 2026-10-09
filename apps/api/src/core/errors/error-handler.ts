/**
 * Central Express error handler: every error leaves the API as problem+json.
 *
 * - `DomainError`s map to their problem type, status, `errors[]` and headers.
 * - Client errors raised by Express middleware (for example a body parser's 400/413/415, which
 *   follow the `http-errors` shape) map to the matching standard problem with a generic detail,
 *   because their messages can quote the request body.
 * - Anything else is a 500 `internal-error` with a generic detail. The stack goes to the log (via `res.err`,
 *   which pino-http writes on the request line), never into the response.
 */
import type { ProblemTypeSlug } from '@investfund/shared';

import { pathOf } from '../logger/http-logger.js';

import { DomainError } from './domain-errors.js';
import { buildProblem, INTERNAL_PROBLEM_DETAIL, sendProblem } from './problem.js';

import type { ErrorRequestHandler, Request } from 'express';

const CLIENT_ERROR_SLUGS: Readonly<
  Partial<Record<number, { slug: ProblemTypeSlug; detail: string }>>
> = {
  400: { slug: 'validation-error', detail: 'The request could not be parsed.' },
  404: { slug: 'not-found', detail: 'The resource was not found.' },
  413: { slug: 'payload-too-large', detail: 'The request body is too large.' },
  415: { slug: 'unsupported-media-type', detail: 'The request content type is not supported.' },
};

interface HttpErrorLike {
  status: number;
  expose: boolean;
}

function isHttpClientError(error: unknown): error is HttpErrorLike {
  if (typeof error !== 'object' || error === null) return false;
  const candidate = error as Partial<HttpErrorLike>;
  return (
    typeof candidate.status === 'number' &&
    candidate.status >= 400 &&
    candidate.status < 500 &&
    candidate.expose === true
  );
}

/** `req.id` is assigned by pino-http; fall back to the response header in case it is absent. */
function requestIdOf(req: Request): string {
  const id = req.id as unknown;
  if (typeof id === 'string' && id.length > 0) return id;
  if (typeof id === 'number') return String(id);
  const header = req.res?.getHeader('X-Request-Id');
  return typeof header === 'string' && header.length > 0 ? header : 'unknown';
}

export function createErrorHandler(): ErrorRequestHandler {
  return (error: unknown, req, res, next) => {
    if (res.headersSent) {
      // Too late for a problem body: let Express close the connection.
      next(error);
      return;
    }

    const base = { requestId: requestIdOf(req), instance: pathOf(req.originalUrl) };

    if (error instanceof DomainError) {
      if (error.status >= 500) res.err = error;
      for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
      sendProblem(
        res,
        buildProblem(error.slug, { ...base, detail: error.message, errors: error.errors }),
      );
      return;
    }

    if (isHttpClientError(error)) {
      const mapped = CLIENT_ERROR_SLUGS[error.status];
      if (mapped !== undefined) {
        sendProblem(res, buildProblem(mapped.slug, { ...base, detail: mapped.detail }));
        return;
      }
    }

    res.err = error instanceof Error ? error : new Error('Non-Error value thrown');
    sendProblem(res, buildProblem('internal-error', { ...base, detail: INTERNAL_PROBLEM_DETAIL }));
  };
}
