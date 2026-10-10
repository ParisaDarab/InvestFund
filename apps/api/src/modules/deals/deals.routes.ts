/** `/api/v1/deals` (docs/API.md §6.8). */
import { Router } from 'express';
import { z } from 'zod';

import {
  CreateDealRequest,
  DealActionRequest,
  DealListQuery,
  DealPage,
  DealView,
  RespondToOfferRequest,
} from '@investfund/shared';

import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';

import { DealService } from './deal.service.js';

import type { ModuleContext } from '../context.js';

const IdParams = z.strictObject({ dealId: z.uuid() });
const OfferParams = z.strictObject({ dealId: z.uuid(), offerId: z.uuid() });

export function createDealService(ctx: ModuleContext): DealService {
  return new DealService(ctx.prisma, ctx.unitOfWork, ctx.notifier, ctx.realtimeHub, ctx.logger);
}

export function buildDealRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const service = createDealService(ctx);
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');
  const sensitive = ctx.rateLimiter.limit('sensitive');

  router.get('/', auth, limit, validate({ query: DealListQuery }), async (req, res) => {
    const user = requireUser(req.user);
    const query = req.query as unknown as z.output<typeof DealListQuery>;
    res.setHeader('Cache-Control', 'no-store');
    res.json(DealPage.parse(await service.list(user.id, query)));
  });

  router.post('/', auth, sensitive, validate({ body: CreateDealRequest }), async (req, res) => {
    const user = requireUser(req.user);
    const body = req.body as z.output<typeof CreateDealRequest>;
    const deal = await service.create(user.id, body.connectionId, body.terms);
    res.status(201).location(`/api/v1/deals/${deal.id}`).json(DealView.parse(deal));
  });

  router.get('/:dealId', auth, limit, validate({ params: IdParams }), async (req, res) => {
    const user = requireUser(req.user);
    const { dealId } = req.params as z.output<typeof IdParams>;
    res.setHeader('Cache-Control', 'no-store');
    res.json(DealView.parse(await service.get(user.id, dealId)));
  });

  router.post(
    '/:dealId/offers/:offerId/respond',
    auth,
    sensitive,
    validate({ params: OfferParams, body: RespondToOfferRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { dealId, offerId } = req.params as z.output<typeof OfferParams>;
      const body = req.body as z.output<typeof RespondToOfferRequest>;
      res.json(
        DealView.parse(
          await service.respond(
            user.id,
            dealId,
            offerId,
            body.action,
            body.terms,
            body.note ?? null,
          ),
        ),
      );
    },
  );

  router.post(
    '/:dealId/actions',
    auth,
    sensitive,
    validate({ params: IdParams, body: DealActionRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { dealId } = req.params as z.output<typeof IdParams>;
      const body = req.body as z.output<typeof DealActionRequest>;
      res.json(
        DealView.parse(
          await service.act(user.id, dealId, body.action, body.version, body.reason ?? null),
        ),
      );
    },
  );

  return router;
}
