/**
 * Public discovery (search, filters, detail) and personalised recommendations.
 * Only published startups of active founders are ever returned; drafts, archived listings and
 * suspended founders' listings are excluded by every query here.
 */
import type {
  Recommendation,
  RecommendationPage,
  StartupDetail,
  StartupPage,
  StartupRelationship,
  StartupSearchQuery,
} from '@investfund/shared';
import { CONNECTION_RETRY_AFTER_DECLINE_DAYS } from '@investfund/shared';

import { NotFoundError } from '../../core/errors/domain-errors.js';
import { offsetCursor } from '../shared/cursor.js';
import { blockedUserIds, isBlockedBetween } from '../shared/policies.js';
import {
  reportedFunding,
  startupInclude,
  toDetail,
  toSummary,
} from '../startups/startup.mapper.js';

import { compareRecommendations, scoreMatch } from './matching.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { z } from 'zod';

type SearchInput = z.output<typeof StartupSearchQuery>;

/** Most candidates scored per recommendation request (newest first). See docs/MATCHING.md. */
export const RECOMMENDATION_CANDIDATE_LIMIT = 500;

export const PUBLIC_STARTUP_WHERE = {
  status: 'published',
  founder: { status: 'active' },
} satisfies Prisma.StartupWhereInput;

export class DiscoveryService {
  constructor(private readonly prisma: PrismaClient) {}

  async search(query: SearchInput, viewerId: string | null): Promise<StartupPage> {
    const and: Prisma.StartupWhereInput[] = [PUBLIC_STARTUP_WHERE];
    if (viewerId !== null) {
      const blocked = await blockedUserIds(this.prisma, viewerId);
      if (blocked.length > 0) and.push({ founderId: { notIn: blocked } });
    }
    if (query.q !== undefined && query.q !== '') {
      and.push({
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { tagline: { contains: query.q, mode: 'insensitive' } },
          { description: { contains: query.q, mode: 'insensitive' } },
        ],
      });
    }
    if (query.sector?.length) and.push({ sector: { in: query.sector } });
    if (query.stage?.length) and.push({ stage: { in: query.stage } });
    if (query.country?.length) and.push({ country: { in: query.country } });
    if (query.purpose?.length) and.push({ fundingPurposes: { hasSome: query.purpose } });
    if (query.currency !== undefined) and.push({ currency: query.currency });
    // Acceptable range overlaps the requested amounts.
    if (query.amountMin !== undefined)
      and.push({ maxAmountMinor: { gte: BigInt(query.amountMin) } });
    if (query.amountMax !== undefined)
      and.push({ minAmountMinor: { lte: BigInt(query.amountMax) } });

    const orderBy: Prisma.StartupOrderByWithRelationInput[] =
      query.sort === 'deadline'
        ? [{ fundingDeadline: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
        : query.sort === 'target_asc'
          ? [{ targetAmountMinor: 'asc' }, { id: 'asc' }]
          : query.sort === 'target_desc'
            ? [{ targetAmountMinor: 'desc' }, { id: 'asc' }]
            : [{ publishedAt: 'desc' }, { id: 'desc' }];

    const offset = offsetCursor.decode(query.cursor);
    const rows = await this.prisma.startup.findMany({
      where: { AND: and },
      include: startupInclude,
      orderBy,
      skip: offset,
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const funded = await reportedFunding(
      this.prisma,
      page.map((r) => r.id),
    );
    return {
      data: page.map((row) => toSummary(row, funded.get(row.id) ?? 0n)),
      nextCursor: rows.length > query.limit ? offsetCursor.encode(offset + query.limit) : null,
    };
  }

  async getPublic(idOrSlug: { slug: string } | { id: string }): Promise<StartupDetail> {
    const row = await this.prisma.startup.findFirst({
      where: { ...idOrSlug, ...PUBLIC_STARTUP_WHERE },
      include: startupInclude,
    });
    if (row === null) throw new NotFoundError('The startup was not found.');
    const funded = await reportedFunding(this.prisma, [row.id]);
    return toDetail(row, funded.get(row.id) ?? 0n);
  }

  async relationship(
    viewer: { id: string; role: string | null },
    startupId: string,
  ): Promise<StartupRelationship> {
    const startup = await this.prisma.startup.findUnique({
      where: { id: startupId },
      select: { id: true, founderId: true, status: true, founder: { select: { status: true } } },
    });
    if (startup === null) throw new NotFoundError('The startup was not found.');
    const isOwner = startup.founderId === viewer.id;
    if (!isOwner && (startup.status !== 'published' || startup.founder.status !== 'active')) {
      throw new NotFoundError('The startup was not found.');
    }
    const [saved, blocked, connection, profile] = await Promise.all([
      this.prisma.savedStartup.count({ where: { userId: viewer.id, startupId } }),
      isBlockedBetween(this.prisma, viewer.id, startup.founderId),
      this.prisma.connection.findFirst({
        where: { startupId, supporterId: viewer.id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { id: true, status: true, respondedAt: true },
      }),
      this.prisma.supporterProfile.count({ where: { userId: viewer.id } }),
    ]);

    let reason: string | null = null;
    if (isOwner) reason = 'owner';
    else if (viewer.role !== 'supporter') reason = 'not_supporter';
    else if (profile === 0) reason = 'profile_incomplete';
    else if (blocked) reason = 'blocked';
    else if (connection?.status === 'pending' || connection?.status === 'accepted')
      reason = 'exists';
    else if (connection?.status === 'declined' && connection.respondedAt !== null) {
      const retryAt =
        connection.respondedAt.getTime() + CONNECTION_RETRY_AFTER_DECLINE_DAYS * 86_400_000;
      if (Date.now() < retryAt) reason = 'recently_declined';
    }
    return {
      isOwner,
      saved: saved > 0,
      blocked,
      connection: connection === null ? null : { id: connection.id, status: connection.status },
      canRequestConnection: reason === null,
      requestBlockedReason: reason,
    };
  }

  async recommendations(
    supporterId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<RecommendationPage> {
    const profile = await this.prisma.supporterProfile.findUnique({
      where: { userId: supporterId },
    });
    if (profile === null) return { data: [], nextCursor: null };
    const blocked = await blockedUserIds(this.prisma, supporterId);
    const candidates = await this.prisma.startup.findMany({
      where: {
        AND: [PUBLIC_STARTUP_WHERE, { founderId: { notIn: [supporterId, ...blocked] } }],
      },
      include: startupInclude,
      orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      take: RECOMMENDATION_CANDIDATE_LIMIT,
    });
    const scored = candidates
      .map((row) => ({
        row,
        ...scoreMatch(profile, row),
        publishedAt: row.publishedAt,
        id: row.id,
      }))
      .sort(compareRecommendations);

    const offset = offsetCursor.decode(cursor);
    const page = scored.slice(offset, offset + limit);
    const funded = await reportedFunding(
      this.prisma,
      page.map((p) => p.id),
    );
    const data: Recommendation[] = page.map((item) => ({
      startup: toSummary(item.row, funded.get(item.id) ?? 0n),
      score: item.score,
      factors: item.factors,
      explanation: item.explanation,
    }));
    return {
      data,
      nextCursor: offset + limit < scored.length ? offsetCursor.encode(offset + limit) : null,
    };
  }
}
