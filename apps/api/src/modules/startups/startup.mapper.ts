/** Startup rows → public and owner views. Private fields never reach the public mappers. */
import {
  getPublicationIssues,
  type OwnedStartup,
  type StartupDetail,
  type StartupSummary,
} from '@investfund/shared';

import { dateOnly, iso, isoOrNull, minor, minorOrNull } from '../shared/serialize.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';

export const startupInclude = {
  milestones: { orderBy: { position: 'asc' } },
  founder: {
    select: { id: true, founderProfile: { select: { displayName: true, headline: true } } },
  },
} satisfies Prisma.StartupInclude;

export type StartupRow = Prisma.StartupGetPayload<{ include: typeof startupInclude }>;

/** Reported funding per startup: completed deals in the startup's currency. */
export async function reportedFunding(
  db: TransactionClient | PrismaClient,
  startupIds: readonly string[],
): Promise<Map<string, bigint>> {
  if (startupIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ startup_id: string; total: bigint }[]>`
    SELECT d.startup_id, coalesce(sum(o.amount_minor), 0)::bigint AS total
    FROM deals d
    JOIN offers o ON o.id = d.accepted_offer_id
    JOIN startups s ON s.id = d.startup_id
    WHERE d.status = 'completed'
      AND o.currency = s.currency
      AND d.startup_id = ANY(${startupIds as string[]}::uuid[])
    GROUP BY d.startup_id`;
  return new Map(rows.map((row) => [row.startup_id, row.total]));
}

export function toSummary(row: StartupRow, funded: bigint): StartupSummary {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    sector: row.sector as StartupSummary['sector'],
    stage: row.stage as StartupSummary['stage'],
    country: row.country,
    fundingPurposes: row.fundingPurposes as StartupSummary['fundingPurposes'],
    currency: row.currency as StartupSummary['currency'],
    targetAmountMinor: minorOrNull(row.targetAmountMinor),
    minAmountMinor: minorOrNull(row.minAmountMinor),
    maxAmountMinor: minorOrNull(row.maxAmountMinor),
    fundingDeadline: dateOnly(row.fundingDeadline),
    reportedFundingMinor: minor(funded),
    milestoneCount: row.milestones.length,
    publishedAt: isoOrNull(row.publishedAt),
    founder: {
      id: row.founder.id,
      displayName: row.founder.founderProfile?.displayName ?? 'Founder',
    },
  };
}

export function toDetail(row: StartupRow, funded: bigint): StartupDetail {
  return {
    ...toSummary(row, funded),
    description: row.description,
    problem: row.problem,
    solution: row.solution,
    targetMarket: row.targetMarket,
    productDescription: row.productDescription,
    businessModel: row.businessModel,
    teamDescription: row.teamDescription,
    websiteUrl: row.websiteUrl,
    fundingPurposeText: row.fundingPurposeText,
    founderHeadline: row.founder.founderProfile?.headline ?? null,
    milestones: row.milestones.map((m) => ({
      id: m.id,
      position: m.position,
      title: m.title,
      description: m.description,
      targetAmountMinor: minor(m.targetAmountMinor),
      currency: m.currency as StartupSummary['currency'],
      targetDate: dateOnly(m.targetDate),
    })),
  };
}

export function publicationIssuesOf(row: StartupRow, today?: string) {
  return getPublicationIssues(
    {
      name: row.name,
      tagline: row.tagline,
      description: row.description,
      sector: row.sector,
      stage: row.stage,
      country: row.country,
      fundingPurposes: row.fundingPurposes,
      fundingPurposeText: row.fundingPurposeText,
      currency: row.currency,
      targetAmountMinor: row.targetAmountMinor,
      minAmountMinor: row.minAmountMinor,
      maxAmountMinor: row.maxAmountMinor,
      fundingDeadline: dateOnly(row.fundingDeadline),
      milestones: row.milestones.map((m) => ({
        targetAmountMinor: m.targetAmountMinor,
        currency: m.currency,
      })),
    },
    today,
  );
}

export function toOwned(row: StartupRow, funded: bigint): OwnedStartup {
  return {
    ...toDetail(row, funded),
    status: row.status,
    version: row.version,
    archivedAt: isoOrNull(row.archivedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
    publicationIssues: publicationIssuesOf(row),
  };
}
