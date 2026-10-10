/**
 * `/api/v1/me`: the current account, onboarding role choice and role-specific profile
 * (docs/API.md §6.2).
 */
import { Router } from 'express';

import {
  ChooseRoleRequest,
  CurrentUser,
  FounderProfile,
  FounderProfileInput,
  SupporterProfile,
  SupporterProfileInput,
  UnreadCounts,
  UpdateAccountRequest,
} from '@investfund/shared';

import { ConflictError, NotFoundError } from '../../core/errors/domain-errors.js';
import { validate } from '../../core/validation/validate.js';
import { countUnreadMessages } from '../conversations/unread.js';
import { requireRoleOf, requireUser } from '../shared/actor.js';
import { recordAudit } from '../shared/audit.js';
import { bigintOrNull, iso, minorOrNull } from '../shared/serialize.js';

import { currentUserInclude, toCurrentUser } from './user.mapper.js';

import type { ModuleContext } from '../context.js';
import type { z } from 'zod';

type FounderProfileRow = NonNullable<
  Awaited<ReturnType<ModuleContext['prisma']['founderProfile']['findUnique']>>
>;
type SupporterProfileRow = NonNullable<
  Awaited<ReturnType<ModuleContext['prisma']['supporterProfile']['findUnique']>>
>;

export function toFounderProfile(row: FounderProfileRow): FounderProfile {
  return {
    userId: row.userId,
    displayName: row.displayName,
    headline: row.headline,
    bio: row.bio,
    country: row.country,
    linkedinUrl: row.linkedinUrl,
    updatedAt: iso(row.updatedAt),
  };
}

export function toSupporterProfile(row: SupporterProfileRow): SupporterProfile {
  return SupporterProfile.parse({
    userId: row.userId,
    displayName: row.displayName,
    bio: row.bio,
    sectors: row.sectors,
    stages: row.stages,
    purposes: row.purposes,
    countries: row.countries,
    fundingMinMinor: minorOrNull(row.fundingMinMinor),
    fundingMaxMinor: minorOrNull(row.fundingMaxMinor),
    currency: row.currency,
    updatedAt: iso(row.updatedAt),
  });
}

export function buildUserRoutes(ctx: ModuleContext): Router {
  const router = Router();
  const auth = ctx.authGuards.requireAuth();
  const limit = ctx.rateLimiter.limit('default');
  const { prisma } = ctx;

  const loadMe = async (id: string) =>
    toCurrentUser(
      await prisma.user.findUniqueOrThrow({ where: { id }, include: currentUserInclude }),
    );

  router.get('/', auth, limit, async (req, res) => {
    res.json(CurrentUser.parse(await loadMe(requireUser(req.user).id)));
  });

  router.patch('/', auth, limit, validate({ body: UpdateAccountRequest }), async (req, res) => {
    const user = requireUser(req.user);
    const body = req.body as z.output<typeof UpdateAccountRequest>;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(body.name === undefined ? {} : { name: body.name }),
        ...(body.emailNotifications === undefined
          ? {}
          : { emailNotifications: body.emailNotifications }),
      },
    });
    res.json(CurrentUser.parse(await loadMe(user.id)));
  });

  /**
   * One-time role choice. The role is never taken from a token or changed later through this
   * endpoint; `admin` is not selectable (the schema only allows founder and supporter).
   */
  router.post(
    '/role',
    auth,
    ctx.rateLimiter.limit('sensitive'),
    validate({ body: ChooseRoleRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { role } = req.body as ChooseRoleRequest;
      const { count } = await prisma.user.updateMany({
        where: { id: user.id, role: null },
        data: { role, onboardedAt: new Date() },
      });
      if (count === 0) {
        throw new ConflictError('Your role has already been chosen.', { slug: 'invalid-state' });
      }
      await recordAudit(prisma, {
        actorId: user.id,
        action: 'user.role_chosen',
        entityType: 'user',
        entityId: user.id,
        metadata: { role },
      });
      res.json(CurrentUser.parse(await loadMe(user.id)));
    },
  );

  router.get('/unread', auth, limit, async (req, res) => {
    const user = requireUser(req.user);
    const [messages, notifications] = await Promise.all([
      countUnreadMessages(prisma, user.id),
      prisma.notification.count({ where: { userId: user.id, readAt: null } }),
    ]);
    res.setHeader('Cache-Control', 'no-store');
    res.json(UnreadCounts.parse({ messages, notifications }));
  });

  // ── Founder profile ──
  router.get('/founder-profile', auth, limit, async (req, res) => {
    const user = requireRoleOf(req.user, 'founder');
    const row = await prisma.founderProfile.findUnique({ where: { userId: user.id } });
    if (row === null) throw new NotFoundError('You have not created a founder profile yet.');
    res.json(FounderProfile.parse(toFounderProfile(row)));
  });

  router.put(
    '/founder-profile',
    auth,
    limit,
    validate({ body: FounderProfileInput }),
    async (req, res) => {
      const user = requireRoleOf(req.user, 'founder');
      const body = req.body as z.output<typeof FounderProfileInput>;
      const data = {
        displayName: body.displayName,
        headline: body.headline ?? null,
        bio: body.bio ?? null,
        country: body.country ?? null,
        linkedinUrl: body.linkedinUrl ?? null,
      };
      const row = await prisma.founderProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      });
      res.json(FounderProfile.parse(toFounderProfile(row)));
    },
  );

  // ── Supporter profile ──
  router.get('/supporter-profile', auth, limit, async (req, res) => {
    const user = requireRoleOf(req.user, 'supporter');
    const row = await prisma.supporterProfile.findUnique({ where: { userId: user.id } });
    if (row === null) throw new NotFoundError('You have not created a supporter profile yet.');
    res.json(toSupporterProfile(row));
  });

  router.put(
    '/supporter-profile',
    auth,
    limit,
    validate({ body: SupporterProfileInput }),
    async (req, res) => {
      const user = requireRoleOf(req.user, 'supporter');
      const body = req.body as z.output<typeof SupporterProfileInput>;
      const data = {
        displayName: body.displayName,
        bio: body.bio ?? null,
        sectors: [...new Set(body.sectors)],
        stages: [...new Set(body.stages)],
        purposes: [...new Set(body.purposes)],
        countries: [...new Set(body.countries)],
        fundingMinMinor: bigintOrNull(body.fundingMinMinor),
        fundingMaxMinor: bigintOrNull(body.fundingMaxMinor),
        currency: body.currency,
      };
      const row = await prisma.supporterProfile.upsert({
        where: { userId: user.id },
        create: { userId: user.id, ...data },
        update: data,
      });
      res.json(toSupporterProfile(row));
    },
  );

  return router;
}
