/**
 * `validate({ body, query, params })`: parses request parts with the shared Zod schemas.
 *
 * - On success the parsed values (with defaults and coercions applied, unknown keys removed)
 *   replace `req.body`, `req.query` and `req.params`, so controllers read typed input.
 * - On failure it throws a 400 `validation-error` whose `errors[]` holds one entry per issue:
 *   `path` is the location plus the field path (`body.email`, `query.limit`, `params.startupId`),
 *   `code` is Zod's issue code (`invalid_type`, `too_small`, `unrecognized_keys`...), and
 *   `message` is Zod's message. Messages never quote the submitted value.
 * - Unknown fields are rejected: top-level object schemas are made strict here even when the
 *   schema itself is not, and request schemas in `packages/shared` use `z.strictObject` for
 *   nested objects. Every unknown key gets its own `errors[]` entry.
 */
import { z } from 'zod';

import type { ProblemFieldError } from '@investfund/shared';

import { ValidationError } from '../errors/domain-errors.js';

import type { RequestHandler } from 'express';

export type RequestPart = 'body' | 'query' | 'params';

export type RequestSchemas = Partial<Record<RequestPart, z.ZodType>>;

const PARTS: readonly RequestPart[] = ['params', 'query', 'body'];

/** Makes a top-level object schema strict; other schemas are returned unchanged. */
function strictTopLevel(schema: z.ZodType): z.ZodType {
  return schema instanceof z.ZodObject ? schema.strict() : schema;
}

function joinPath(part: RequestPart, path: readonly PropertyKey[]): string {
  return [part, ...path.map((segment) => String(segment))].join('.');
}

/** Maps Zod issues to `ProblemDetails.errors[]` entries. */
export function toFieldErrors(part: RequestPart, error: z.ZodError): ProblemFieldError[] {
  return error.issues.flatMap((issue): ProblemFieldError[] => {
    if (issue.code === 'unrecognized_keys') {
      return issue.keys.map((key) => ({
        path: joinPath(part, [...issue.path, key]),
        code: issue.code,
        message: 'Unknown field.',
      }));
    }
    return [{ path: joinPath(part, issue.path), code: issue.code, message: issue.message }];
  });
}

export function validate(schemas: RequestSchemas): RequestHandler {
  const prepared = PARTS.flatMap((part) => {
    const schema = schemas[part];
    return schema === undefined ? [] : [{ part, schema: strictTopLevel(schema) }];
  });

  return async (req, _res, next) => {
    const errors: ProblemFieldError[] = [];
    const parsed: Partial<Record<RequestPart, unknown>> = {};
    for (const { part, schema } of prepared) {
      const result = await schema.safeParseAsync(req[part]);
      if (result.success) parsed[part] = result.data;
      else errors.push(...toFieldErrors(part, result.error));
    }
    if (errors.length > 0) {
      throw new ValidationError('The request is invalid.', { errors });
    }

    if ('body' in parsed) req.body = parsed.body;
    if ('params' in parsed) req.params = parsed.params as typeof req.params;
    // Express 5 defines `req.query` as a getter; shadow it with the parsed value.
    if ('query' in parsed) {
      Object.defineProperty(req, 'query', {
        value: parsed.query,
        writable: true,
        configurable: true,
        enumerable: true,
      });
    }
    next();
  };
}
