/** `/api/v1/conversations` (docs/API.md §6.7). */
import { Router } from 'express';
import { z } from 'zod';

import {
  ConversationList,
  ConversationSummary,
  MessageListQuery,
  MessagePage,
  MessageView,
  SendMessageRequest,
} from '@investfund/shared';

import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';

import { ConversationService } from './conversation.service.js';

import type { ModuleContext } from '../context.js';

const IdParams = z.strictObject({ conversationId: z.uuid() });

export function buildConversationRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const service = new ConversationService(
    ctx.prisma,
    ctx.unitOfWork,
    ctx.notifier,
    ctx.realtimeHub,
    ctx.logger,
  );
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');

  router.get('/', auth, limit, async (req, res) => {
    const user = requireUser(req.user);
    res.setHeader('Cache-Control', 'no-store');
    res.json(ConversationList.parse({ data: await service.list(user.id) }));
  });

  router.get('/:conversationId', auth, limit, validate({ params: IdParams }), async (req, res) => {
    const user = requireUser(req.user);
    const { conversationId } = req.params as z.output<typeof IdParams>;
    res.setHeader('Cache-Control', 'no-store');
    res.json(ConversationSummary.parse(await service.get(user.id, conversationId)));
  });

  router.get(
    '/:conversationId/messages',
    auth,
    limit,
    validate({ params: IdParams, query: MessageListQuery }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { conversationId } = req.params as z.output<typeof IdParams>;
      const { cursor, limit: size } = req.query as unknown as z.output<typeof MessageListQuery>;
      res.setHeader('Cache-Control', 'no-store');
      res.json(MessagePage.parse(await service.messages(user.id, conversationId, cursor, size)));
    },
  );

  router.post(
    '/:conversationId/messages',
    auth,
    limit,
    validate({ params: IdParams, body: SendMessageRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { conversationId } = req.params as z.output<typeof IdParams>;
      const body = req.body as z.output<typeof SendMessageRequest>;
      const result = await service.send(user.id, conversationId, body.clientMessageId, body.body);
      res.status(result.created ? 201 : 200).json(MessageView.parse(result.message));
    },
  );

  router.post(
    '/:conversationId/read',
    auth,
    limit,
    validate({ params: IdParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { conversationId } = req.params as z.output<typeof IdParams>;
      await service.markRead(user.id, conversationId);
      res.status(204).end();
    },
  );

  return router;
}
