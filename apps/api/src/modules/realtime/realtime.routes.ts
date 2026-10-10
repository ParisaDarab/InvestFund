/**
 * `GET /api/v1/realtime/stream`: the caller's private event stream (text/event-stream).
 * Browsers open it with `fetch` so the access token travels in the `Authorization` header (never
 * in the URL). Events: `message.created`, `conversation.read`, `notification.created`,
 * `deal.updated`, `connection.updated`. Clients treat events as hints and refetch on reconnect,
 * so a dropped connection never loses data: everything is persisted first.
 */
import { Router } from 'express';

import { RateLimitError } from '../../core/errors/domain-errors.js';
import { requireUser } from '../shared/actor.js';

import type { ModuleContext } from '../context.js';

export function buildRealtimeRoutes(ctx: ModuleContext): Router {
  const router = Router();
  router.get(
    '/stream',
    ctx.authGuards.requireAuth(),
    ctx.rateLimiter.limit('default'),
    (req, res) => {
      const user = requireUser(req.user);
      if (ctx.realtimeHub.connectionCount(user.id) >= 10) {
        throw new RateLimitError('Too many open real-time streams.');
      }
      res.status(200);
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      res.write(`retry: 3000\nevent: ready\ndata: {}\n\n`);
      ctx.realtimeHub.attach(user.id, res);
    },
  );
  return router;
}
