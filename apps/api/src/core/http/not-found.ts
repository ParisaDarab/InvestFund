import { NotFoundError } from '../errors/domain-errors.js';

import type { RequestHandler } from 'express';

/** Fallback for unmatched routes: a 404 problem+json via the central error handler. */
export function createNotFoundHandler(): RequestHandler {
  return (req, _res, next) => {
    next(new NotFoundError(`No route matches ${req.method} ${req.path}.`));
  };
}
