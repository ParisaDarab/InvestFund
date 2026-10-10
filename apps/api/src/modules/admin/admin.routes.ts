/**
 * `/api/v1/admin` (docs/API.md §6.12). Admin-only: the role comes from the database (guards
 * re-read it on every request) and can only be granted by an operator command, never by a user.
 * Every decision is written to the audit trail.
 */
import { Router } from 'express';
import { z } from 'zod';

import {
  AdminOverview,
  AdminReport,
  AdminReportPage,
  AdminReportQuery,
  AdminUserActionRequest,
  ResolveReportRequest,
} from '@investfund/shared';

import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../core/errors/domain-errors.js';
import { validate } from '../../core/validation/validate.js';
import { displayNameOf } from '../moderation/moderation.routes.js';
import { Effects } from '../notifications/effects.js';
import { requireUser } from '../shared/actor.js';
import { recordAudit } from '../shared/audit.js';
import { keysetCursor } from '../shared/cursor.js';
import { iso, isoOrNull } from '../shared/serialize.js';

import type { Prisma } from '../../core/db/prisma.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';
import type { ModuleContext } from '../context.js';

const ReportParams = z.strictObject({ reportId: z.uuid() });
const UserParams = z.strictObject({ userId: z.uuid() });

const reportInclude = {
  reporter: { select: { id: true } },
  targetUser: { select: { id: true, email: true, name: true, status: true } },
  targetStartup: { select: { id: true, name: true, slug: true, status: true } },
} satisfies Prisma.ReportInclude;

type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>;

export function buildAdminRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const admin = ctx.authGuards.requireRole('admin');
  const limit = ctx.rateLimiter.limit('default');
  const { prisma } = ctx;

  const toAdminReport = async (row: ReportRow): Promise<AdminReport> => {
    const related = await prisma.report.count({
      where: {
        status: 'open',
        id: { not: row.id },
        targetUserId: row.targetUserId,
        targetStartupId: row.targetStartupId,
      },
    });
    const target =
      row.targetType === 'user' && row.targetUser !== null
        ? {
            id: row.targetUser.id,
            label: row.targetUser.name,
            detail: row.targetUser.email,
            status: row.targetUser.status,
          }
        : row.targetStartup !== null
          ? {
              id: row.targetStartup.id,
              label: row.targetStartup.name,
              detail: row.targetStartup.slug,
              status: row.targetStartup.status,
            }
          : { id: row.id, label: 'Unknown', detail: '', status: 'unknown' };
    return AdminReport.parse({
      id: row.id,
      targetType: row.targetType,
      target,
      category: row.category,
      details: row.details,
      status: row.status,
      reporter: { id: row.reporterId, displayName: await displayNameOf(prisma, row.reporterId) },
      action: row.action,
      resolutionNote: row.resolutionNote,
      reviewedBy:
        row.reviewedById === null
          ? null
          : { id: row.reviewedById, displayName: await displayNameOf(prisma, row.reviewedById) },
      reviewedAt: isoOrNull(row.reviewedAt),
      createdAt: iso(row.createdAt),
      relatedOpenReports: related,
    });
  };

  const suspendUser = async (
    tx: TransactionClient,
    adminId: string,
    userId: string,
    note: string | null,
  ) => {
    const target = await tx.user.findUnique({ where: { id: userId }, select: { role: true } });
    if (target === null) throw new NotFoundError('The user was not found.');
    if (target.role === 'admin' || userId === adminId) {
      throw new BusinessRuleError('Administrators cannot be suspended here.');
    }
    await tx.user.update({ where: { id: userId }, data: { status: 'suspended' } });
    await tx.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await recordAudit(tx, {
      actorId: adminId,
      action: 'admin.user_suspended',
      entityType: 'user',
      entityId: userId,
      metadata: note === null ? {} : { note },
    });
  };

  router.get('/overview', admin, limit, async (_req, res) => {
    const [users, startups, connections, deals, openReports, emails] = await Promise.all([
      prisma.user.groupBy({ by: ['role', 'status'], _count: { _all: true } }),
      prisma.startup.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.connection.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.deal.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.report.count({ where: { status: 'open' } }),
      prisma.emailOutbox.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const sum = <T extends { _count: { _all: number } }>(rows: T[], match: (row: T) => boolean) =>
      rows.filter(match).reduce((total, row) => total + row._count._all, 0);
    res.setHeader('Cache-Control', 'no-store');
    res.json(
      AdminOverview.parse({
        users: {
          total: sum(users, () => true),
          founders: sum(users, (r) => r.role === 'founder'),
          supporters: sum(users, (r) => r.role === 'supporter'),
          suspended: sum(users, (r) => r.status === 'suspended'),
        },
        startups: {
          published: sum(startups, (r) => r.status === 'published'),
          draft: sum(startups, (r) => r.status === 'draft'),
          archived: sum(startups, (r) => r.status === 'archived'),
        },
        connections: {
          pending: sum(connections, (r) => r.status === 'pending'),
          accepted: sum(connections, (r) => r.status === 'accepted'),
        },
        deals: {
          negotiating: sum(deals, (r) => r.status === 'negotiating'),
          accepted: sum(deals, (r) =>
            ['accepted', 'funding_reported', 'receipt_disputed', 'cancellation_requested'].includes(
              r.status,
            ),
          ),
          completed: sum(deals, (r) => r.status === 'completed'),
          cancelled: sum(deals, (r) => r.status === 'cancelled'),
        },
        reports: { open: openReports },
        emails: {
          pending: sum(emails, (r) => r.status === 'pending'),
          failed: sum(emails, (r) => r.status === 'failed'),
        },
      }),
    );
  });

  router.get('/reports', admin, limit, validate({ query: AdminReportQuery }), async (req, res) => {
    const query = req.query as unknown as z.output<typeof AdminReportQuery>;
    const key = keysetCursor.decode(query.cursor);
    const rows = await prisma.report.findMany({
      where: {
        ...(query.status === undefined ? {} : { status: query.status }),
        ...(key === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: key.createdAt } },
                { createdAt: key.createdAt, id: { lt: key.id } },
              ],
            }),
      },
      include: reportInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    res.setHeader('Cache-Control', 'no-store');
    res.json(
      AdminReportPage.parse({
        data: await Promise.all(page.map(toAdminReport)),
        nextCursor:
          rows.length > query.limit && last !== undefined ? keysetCursor.encode(last) : null,
      }),
    );
  });

  router.get(
    '/reports/:reportId',
    admin,
    limit,
    validate({ params: ReportParams }),
    async (req, res) => {
      const { reportId } = req.params as z.output<typeof ReportParams>;
      const row = await prisma.report.findUnique({
        where: { id: reportId },
        include: reportInclude,
      });
      if (row === null) throw new NotFoundError('The report was not found.');
      res.json(await toAdminReport(row));
    },
  );

  router.post(
    '/reports/:reportId/resolve',
    admin,
    ctx.rateLimiter.limit('sensitive'),
    validate({ params: ReportParams, body: ResolveReportRequest }),
    async (req, res) => {
      const adminUser = requireUser(req.user);
      const { reportId } = req.params as z.output<typeof ReportParams>;
      const body = req.body as z.output<typeof ResolveReportRequest>;
      const effects = new Effects();
      const outcome: { suspendedUserId: string | null } = { suspendedUserId: null };
      await ctx.unitOfWork.run(async (tx) => {
        const report = await tx.report.findUnique({
          where: { id: reportId },
          include: reportInclude,
        });
        if (report === null) throw new NotFoundError('The report was not found.');
        if (report.status !== 'open') {
          throw new ConflictError('This report was already reviewed.', { slug: 'invalid-state' });
        }
        if (body.action === 'startup_archived') {
          if (report.targetStartup === null) {
            throw new BusinessRuleError('Only startup reports can archive a startup.');
          }
          const startup = await tx.startup.update({
            where: { id: report.targetStartup.id },
            data: { status: 'archived', archivedAt: new Date(), version: { increment: 1 } },
            select: { founderId: true, name: true },
          });
          await recordAudit(tx, {
            actorId: adminUser.id,
            action: 'admin.startup_archived',
            entityType: 'startup',
            entityId: report.targetStartup.id,
          });
          await ctx.notifier.notify(tx, effects, {
            userId: startup.founderId,
            type: 'startup_archived_by_admin',
            data: { startupName: startup.name },
            link: '/app/startups',
            dedupeKey: `startup_archived_by_admin:${reportId}`,
          });
        }
        if (body.action === 'user_suspended') {
          const userId =
            report.targetUser?.id ??
            (report.targetStartup === null
              ? null
              : (
                  await tx.startup.findUniqueOrThrow({
                    where: { id: report.targetStartup.id },
                    select: { founderId: true },
                  })
                ).founderId);
          if (userId === null) throw new NotFoundError('The reported user was not found.');
          await suspendUser(tx, adminUser.id, userId, body.note ?? null);
          outcome.suspendedUserId = userId;
        }
        await tx.report.update({
          where: { id: reportId },
          data: {
            status: body.status,
            action: body.action,
            resolutionNote: body.note ?? null,
            reviewedById: adminUser.id,
            reviewedAt: new Date(),
          },
        });
        await recordAudit(tx, {
          actorId: adminUser.id,
          action: `admin.report_${body.status}`,
          entityType: 'report',
          entityId: reportId,
          metadata: { action: body.action },
        });
        await ctx.notifier.notify(tx, effects, {
          userId: report.reporterId,
          type: 'report_resolved',
          data: {},
          link: '/app',
          dedupeKey: `report_resolved:${reportId}`,
        });
      });
      await effects.flush(ctx.realtimeHub, ctx.logger);
      if (outcome.suspendedUserId !== null) ctx.realtimeHub.disconnectUser(outcome.suspendedUserId);
      const row = await prisma.report.findUniqueOrThrow({
        where: { id: reportId },
        include: reportInclude,
      });
      res.json(await toAdminReport(row));
    },
  );

  router.post(
    '/users/:userId/actions',
    admin,
    ctx.rateLimiter.limit('sensitive'),
    validate({ params: UserParams, body: AdminUserActionRequest }),
    async (req, res) => {
      const adminUser = requireUser(req.user);
      const { userId } = req.params as z.output<typeof UserParams>;
      const body = req.body as z.output<typeof AdminUserActionRequest>;
      await ctx.unitOfWork.run(async (tx) => {
        if (body.action === 'suspend') {
          await suspendUser(tx, adminUser.id, userId, body.note ?? null);
        } else {
          const { count } = await tx.user.updateMany({
            where: { id: userId, status: 'suspended' },
            data: { status: 'active' },
          });
          if (count === 0)
            throw new ConflictError('The user is not suspended.', { slug: 'invalid-state' });
          await recordAudit(tx, {
            actorId: adminUser.id,
            action: 'admin.user_reinstated',
            entityType: 'user',
            entityId: userId,
          });
        }
      });
      if (body.action === 'suspend') ctx.realtimeHub.disconnectUser(userId);
      res.status(204).end();
    },
  );

  return router;
}
