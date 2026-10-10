/** `/api/v1/startups`, `/recommendations`, `/saved-startups` (docs/API.md §6.3-§6.5). */
import { Router } from 'express';
import { z } from 'zod';

import {
  CreateStartupRequest,
  OwnedStartup,
  OwnedStartupList,
  RecommendationPage,
  RecommendationQuery,
  ReplaceMilestonesRequest,
  StartupDetail,
  StartupPage,
  StartupRelationship,
  StartupSearchQuery,
  StartupVersionRequest,
  UpdateStartupRequest,
} from '@investfund/shared';

import { validate } from '../../core/validation/validate.js';
import { DiscoveryService } from '../discovery/discovery.service.js';
import { requireRoleOf, requireUser } from '../shared/actor.js';

import { reportedFunding, startupInclude, toSummary } from './startup.mapper.js';
import { StartupService } from './startup.service.js';

import type { ModuleContext } from '../context.js';

const IdParams = z.strictObject({ startupId: z.uuid() });
const SlugParams = z.strictObject({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});
const StatusAction = z.strictObject({
  startupId: z.uuid(),
  action: z.enum(['publish', 'unpublish', 'archive', 'restore']),
});

export function buildStartupRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const service = new StartupService(ctx.prisma, ctx.unitOfWork);
  const discovery = new DiscoveryService(ctx.prisma);
  const { authGuards } = ctx;
  const limit = ctx.rateLimiter.limit('default');
  const founder = authGuards.requireRole('founder');

  router.get(
    '/',
    authGuards.optionalAuth(),
    limit,
    validate({ query: StartupSearchQuery }),
    async (req, res) => {
      const query = req.query as unknown as z.output<typeof StartupSearchQuery>;
      res.json(StartupPage.parse(await discovery.search(query, req.user?.id ?? null)));
    },
  );

  router.get('/by-slug/:slug', limit, validate({ params: SlugParams }), async (req, res) => {
    const { slug } = req.params as z.output<typeof SlugParams>;
    res.json(StartupDetail.parse(await discovery.getPublic({ slug })));
  });

  router.get('/mine', founder, limit, async (req, res) => {
    const user = requireUser(req.user);
    res.json(OwnedStartupList.parse({ data: await service.listMine(user.id) }));
  });

  router.post('/', founder, limit, validate({ body: CreateStartupRequest }), async (req, res) => {
    const user = requireUser(req.user);
    const created = await service.create(
      user.id,
      req.body as z.output<typeof CreateStartupRequest>,
    );
    res
      .status(201)
      .location(`/api/v1/startups/mine/${created.id}`)
      .json(OwnedStartup.parse(created));
  });

  router.get(
    '/mine/:startupId',
    founder,
    limit,
    validate({ params: IdParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      res.json(OwnedStartup.parse(await service.getOwned(user.id, startupId)));
    },
  );

  router.patch(
    '/:startupId',
    founder,
    limit,
    validate({ params: IdParams, body: UpdateStartupRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      const body = req.body as z.output<typeof UpdateStartupRequest>;
      res.json(OwnedStartup.parse(await service.update(user.id, startupId, body)));
    },
  );

  router.put(
    '/:startupId/milestones',
    founder,
    limit,
    validate({ params: IdParams, body: ReplaceMilestonesRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      const body = req.body as z.output<typeof ReplaceMilestonesRequest>;
      res.json(OwnedStartup.parse(await service.replaceMilestones(user.id, startupId, body)));
    },
  );

  router.post(
    '/:startupId/:action',
    founder,
    limit,
    validate({ params: StatusAction, body: StartupVersionRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId, action } = req.params as z.output<typeof StatusAction>;
      const { version } = req.body as z.output<typeof StartupVersionRequest>;
      const result =
        action === 'publish'
          ? await service.publish(user.id, startupId, version)
          : await service.changeStatus(user.id, startupId, version, action);
      res.json(OwnedStartup.parse(result));
    },
  );

  router.get(
    '/:startupId/relationship',
    authGuards.requireAuth(),
    limit,
    validate({ params: IdParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      res.setHeader('Cache-Control', 'no-store');
      res.json(StartupRelationship.parse(await discovery.relationship(user, startupId)));
    },
  );

  router.put(
    '/:startupId/save',
    authGuards.requireRole('supporter'),
    limit,
    validate({ params: IdParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      await discovery.getPublic({ id: startupId });
      await ctx.prisma.savedStartup.createMany({
        data: [{ userId: user.id, startupId }],
        skipDuplicates: true,
      });
      res.status(204).end();
    },
  );

  router.delete(
    '/:startupId/save',
    authGuards.requireRole('supporter'),
    limit,
    validate({ params: IdParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof IdParams>;
      await ctx.prisma.savedStartup.deleteMany({ where: { userId: user.id, startupId } });
      res.status(204).end();
    },
  );

  return router;
}

export function buildRecommendationRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const discovery = new DiscoveryService(ctx.prisma);
  router.get(
    '/',
    ctx.authGuards.requireRole('supporter'),
    ctx.rateLimiter.limit('default'),
    validate({ query: RecommendationQuery }),
    async (req, res) => {
      const user = requireRoleOf(req.user, 'supporter');
      const { cursor, limit } = req.query as unknown as z.output<typeof RecommendationQuery>;
      res.setHeader('Cache-Control', 'no-store');
      res.json(RecommendationPage.parse(await discovery.recommendations(user.id, cursor, limit)));
    },
  );
  return router;
}

const SavedQuery = z.strictObject({});

export function buildSavedRoutes(ctx: ModuleContext): Router {
  const router = Router();
  router.get(
    '/',
    ctx.authGuards.requireRole('supporter'),
    ctx.rateLimiter.limit('default'),
    validate({ query: SavedQuery }),
    async (req, res) => {
      const user = requireUser(req.user);
      const saved = await ctx.prisma.savedStartup.findMany({
        where: { userId: user.id, startup: { status: 'published', founder: { status: 'active' } } },
        include: { startup: { include: startupInclude } },
        orderBy: [{ createdAt: 'desc' }],
        take: 200,
      });
      const funded = await reportedFunding(
        ctx.prisma,
        saved.map((s) => s.startupId),
      );
      res.json(
        StartupPage.parse({
          data: saved.map((s) => toSummary(s.startup, funded.get(s.startupId) ?? 0n)),
          nextCursor: null,
        }),
      );
    },
  );
  return router;
}
