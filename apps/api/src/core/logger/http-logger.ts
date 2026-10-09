/**
 * Per-request logging and request IDs (pino-http).
 *
 * The request ID comes from a well-formed incoming `X-Request-Id` header or is generated
 * (UUID v4). It is echoed in the `X-Request-Id` response header, bound to `req.log`, written
 * on the request log line as `req.id` and used as `requestId` in problem+json bodies.
 */
import { randomUUID } from 'node:crypto';

import { pinoHttp, type HttpLogger } from 'pino-http';

import type { Logger } from './logger.js';
import type { IncomingMessage, ServerResponse } from 'node:http';

export const REQUEST_ID_HEADER = 'X-Request-Id';

/** Accepted incoming IDs: 1-128 visible characters that are safe in headers and logs. */
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

/** Returns the incoming ID when it is well formed, otherwise a fresh UUID. */
export function resolveRequestId(incoming: string | string[] | undefined): string {
  const value = Array.isArray(incoming) ? incoming[0] : incoming;
  return value !== undefined && REQUEST_ID_PATTERN.test(value) ? value : randomUUID();
}

/** Path without the query string: query parameters may carry tokens or personal data. */
export function pathOf(url: string | undefined): string {
  if (url === undefined) return '';
  const end = url.search(/[?#]/);
  return end === -1 ? url : url.slice(0, end);
}

export function createHttpLogger(logger: Logger): HttpLogger {
  return pinoHttp({
    logger,
    genReqId(req: IncomingMessage, res: ServerResponse) {
      const id = resolveRequestId(req.headers['x-request-id']);
      res.setHeader(REQUEST_ID_HEADER, id);
      return id;
    },
    customLogLevel(_req, res, err) {
      if (err !== undefined || res.statusCode >= 500) return 'error';
      if (res.statusCode >= 400) return 'warn';
      return 'info';
    },
    serializers: {
      req: (req: { id: unknown; method: string; url: string }) => ({
        id: req.id,
        method: req.method,
        path: pathOf(req.url),
      }),
      res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
    },
  });
}
