/** `/api/v1/notifications` (docs/API.md §6.9). */
import { Router } from 'express';

import {
  MarkNotificationsReadRequest,
  NotificationListQuery,
  NotificationPage,
  NotificationView,
} from '@investfund/shared';

import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';
import { keysetCursor } from '../shared/cursor.js';
import { iso, isoOrNull } from '../shared/serialize.js';

import { Effects } from './effects.js';

import type { ModuleContext } from '../context.js';
import type { z } from 'zod';

export function buildNotificationRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');
  const { prisma } = ctx;

  router.get('/', auth, limit, validate({ query: NotificationListQuery }), async (req, res) => {
    const user = requireUser(req.user);
    const query = req.query as unknown as z.output<typeof NotificationListQuery>;
    const key = keysetCursor.decode(query.cursor);
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: {
          userId: user.id,
          ...(query.unreadOnly === true ? { readAt: null } : {}),
          ...(key === null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: key.createdAt } },
                  { createdAt: key.createdAt, id: { lt: key.id } },
                ],
              }),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: query.limit + 1,
      }),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    res.setHeader('Cache-Control', 'no-store');
    res.json(
      NotificationPage.parse({
        data: page.map((n): NotificationView =>
          NotificationView.parse({
            id: n.id,
            type: n.type,
            data: n.data,
            link: n.link,
            readAt: isoOrNull(n.readAt),
            createdAt: iso(n.createdAt),
          }),
        ),
        nextCursor:
          rows.length > query.limit && last !== undefined ? keysetCursor.encode(last) : null,
        unreadCount,
      }),
    );
  });

  router.post(
    '/read',
    auth,
    limit,
    validate({ body: MarkNotificationsReadRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const body = req.body as z.output<typeof MarkNotificationsReadRequest>;
      await prisma.notification.updateMany({
        where: {
          userId: user.id,
          readAt: null,
          ...(body.ids === undefined ? {} : { id: { in: body.ids } }),
        },
        data: { readAt: new Date() },
      });
      const effects = new Effects();
      effects.emit({ userIds: [user.id], type: 'notification.read', data: {} });
      await effects.flush(ctx.realtimeHub, ctx.logger);
      res.status(204).end();
    },
  );

  return router;
}
