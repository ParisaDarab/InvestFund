/** `/api/v1/connections` (docs/API.md §6.6). */
import { Router } from 'express';
import { z } from 'zod';

import {
  ConnectionActionRequest,
  ConnectionListQuery,
  ConnectionPage,
  ConnectionView,
  CreateConnectionRequest,
} from '@investfund/shared';

import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';

import { ConnectionService } from './connection.service.js';

import type { ModuleContext } from '../context.js';

const IdParams = z.strictObject({ connectionId: z.uuid() });

export function buildConnectionRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const service = new ConnectionService(
    ctx.prisma,
    ctx.unitOfWork,
    ctx.notifier,
    ctx.realtimeHub,
    ctx.logger,
  );
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');

  router.get('/', auth, limit, validate({ query: ConnectionListQuery }), async (req, res) => {
    const user = requireUser(req.user);
    const query = req.query as unknown as z.output<typeof ConnectionListQuery>;
    res.setHeader('Cache-Control', 'no-store');
    res.json(ConnectionPage.parse(await service.list(user.id, query)));
  });

  router.post(
    '/',
    ctx.authGuards.requireRole('supporter'),
    ctx.rateLimiter.limit('sensitive'),
    validate({ body: CreateConnectionRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const body = req.body as z.output<typeof CreateConnectionRequest>;
      const created = await service.request(user.id, body.startupId, body.message ?? null);
      res
        .status(201)
        .location(`/api/v1/connections/${created.id}`)
        .json(ConnectionView.parse(created));
    },
  );

  router.get('/:connectionId', auth, limit, validate({ params: IdParams }), async (req, res) => {
    const user = requireUser(req.user);
    const { connectionId } = req.params as z.output<typeof IdParams>;
    res.json(ConnectionView.parse(await service.get(user.id, connectionId)));
  });

  router.post(
    '/:connectionId/actions',
    auth,
    ctx.rateLimiter.limit('sensitive'),
    validate({ params: IdParams, body: ConnectionActionRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { connectionId } = req.params as z.output<typeof IdParams>;
      const { action } = req.body as z.output<typeof ConnectionActionRequest>;
      res.json(ConnectionView.parse(await service.act(user.id, connectionId, action)));
    },
  );

  return router;
}
