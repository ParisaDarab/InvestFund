import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Wraps an async route handler so that a rejected promise reaches the central error handler.
 * Express 5 already does this for returned promises; the wrapper keeps the behaviour explicit
 * and typed for controllers (`create = asyncHandler(async (req, res) => { ... })`).
 */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}
