/** Blocking and reporting (docs/API.md §6.11). Enforcement lives in `shared/policies.ts`. */
import { Router } from 'express';
import { z } from 'zod';

import { BlockList, BlockRequest, CreateReportRequest, ReportReceipt } from '@investfund/shared';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';
import { recordAudit } from '../shared/audit.js';
import { iso } from '../shared/serialize.js';

import type { ModuleContext } from '../context.js';

const UserParams = z.strictObject({ userId: z.uuid() });

/** Display name of any user without exposing their email. */
export async function displayNameOf(
  prisma: ModuleContext['prisma'],
  userId: string,
): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      role: true,
      founderProfile: { select: { displayName: true } },
      supporterProfile: { select: { displayName: true } },
    },
  });
  return user?.founderProfile?.displayName ?? user?.supporterProfile?.displayName ?? 'User';
}

export function buildBlockRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');
  const { prisma } = ctx;

  router.get('/', auth, limit, async (req, res) => {
    const user = requireUser(req.user);
    const rows = await prisma.userBlock.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: 'desc' },
    });
    const data = await Promise.all(
      rows.map(async (row) => ({
        user: { id: row.blockedId, displayName: await displayNameOf(prisma, row.blockedId) },
        createdAt: iso(row.createdAt),
      })),
    );
    res.json(BlockList.parse({ data }));
  });

  /**
   * Blocks a user. Pending connection requests between the two are closed at once; accepted
   * connections stay as read-only history (docs/DOMAIN_RULES.md §6).
   */
  router.post(
    '/',
    auth,
    ctx.rateLimiter.limit('sensitive'),
    validate({ body: BlockRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { userId } = req.body as z.output<typeof BlockRequest>;
      if (userId === user.id) throw new BusinessRuleError('You cannot block yourself.');
      const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (target === null) throw new NotFoundError('The user was not found.');
      await ctx.unitOfWork.run(async (tx) => {
        await tx.userBlock.createMany({
          data: [{ blockerId: user.id, blockedId: userId }],
          skipDuplicates: true,
        });
        const now = new Date();
        await tx.connection.updateMany({
          where: { status: 'pending', supporterId: user.id, founderId: userId },
          data: { status: 'withdrawn', respondedAt: now },
        });
        await tx.connection.updateMany({
          where: { status: 'pending', supporterId: userId, founderId: user.id },
          data: { status: 'declined', respondedAt: now },
        });
        await recordAudit(tx, {
          actorId: user.id,
          action: 'user.blocked',
          entityType: 'user',
          entityId: userId,
        });
      });
      res.status(204).end();
    },
  );

  router.delete('/:userId', auth, limit, validate({ params: UserParams }), async (req, res) => {
    const user = requireUser(req.user);
    const { userId } = req.params as z.output<typeof UserParams>;
    const { count } = await prisma.userBlock.deleteMany({
      where: { blockerId: user.id, blockedId: userId },
    });
    if (count > 0) {
      await recordAudit(prisma, {
        actorId: user.id,
        action: 'user.unblocked',
        entityType: 'user',
        entityId: userId,
      });
    }
    res.status(204).end();
  });

  return router;
}

export function buildReportRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const { prisma } = ctx;

  router.post(
    '/',
    ctx.authGuards.requireAuth(),
    ctx.rateLimiter.limit('sensitive'),
    validate({ body: CreateReportRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const body = req.body as z.output<typeof CreateReportRequest>;
      let targetUserId: string | null = null;
      let targetStartupId: string | null = null;
      if (body.targetType === 'user') {
        const target = await prisma.user.findUnique({
          where: { id: body.targetId },
          select: { id: true },
        });
        if (target === null) throw new NotFoundError('The user was not found.');
        if (target.id === user.id) throw new BusinessRuleError('You cannot report yourself.');
        targetUserId = target.id;
      } else {
        const target = await prisma.startup.findFirst({
          where: { id: body.targetId, OR: [{ status: 'published' }, { founderId: user.id }] },
          select: { id: true, founderId: true },
        });
        if (target === null) throw new NotFoundError('The startup was not found.');
        if (target.founderId === user.id)
          throw new BusinessRuleError('You cannot report your own startup.');
        targetStartupId = target.id;
      }
      const duplicate = await prisma.report.count({
        where: { reporterId: user.id, status: 'open', targetUserId, targetStartupId },
      });
      if (duplicate > 0) throw new ConflictError('You already have an open report about this.');

      const report = await prisma.report.create({
        data: {
          id: newId(),
          reporterId: user.id,
          targetType: body.targetType,
          targetUserId,
          targetStartupId,
          category: body.category,
          details: body.details ?? null,
        },
      });
      await recordAudit(prisma, {
        actorId: user.id,
        action: 'report.created',
        entityType: 'report',
        entityId: report.id,
        metadata: { targetType: body.targetType, category: body.category },
      });
      res.status(201).json(
        ReportReceipt.parse({
          id: report.id,
          status: report.status,
          createdAt: iso(report.createdAt),
        }),
      );
    },
  );

  return router;
}
