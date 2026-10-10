/** Startup, milestone and discovery contracts (docs/API.md §6.3-§6.5). */
import { z } from 'zod';

import { AmountMinor, Currency, IsoDate, IsoDateTime, Uuid, cursorPage, Cursor } from './common.js';
import {
  CalendarDate,
  Country,
  FundingPurpose,
  PersonSummary,
  PositiveAmountMinor,
  Sector,
  Stage,
  WebUrl,
  optionalText,
  queryList,
  requiredText,
} from './fields.js';

export const STARTUP_STATUSES = ['draft', 'published', 'archived'] as const;
export const StartupStatusSchema = z.enum(STARTUP_STATUSES).meta({ id: 'StartupStatus' });
export type StartupStatus = z.infer<typeof StartupStatusSchema>;

/**
 * Draft fields. Everything except `name` may be missing while drafting; publication checks
 * completeness (`getPublicationIssues`). Cross-field funding rules run in the service so the
 * same rules apply to partial updates.
 */
const startupFields = {
  name: requiredText(80),
  tagline: optionalText(140),
  description: optionalText(5000),
  problem: optionalText(2000),
  solution: optionalText(2000),
  sector: Sector.nullable().optional(),
  stage: Stage.nullable().optional(),
  country: Country.nullable().optional(),
  targetMarket: optionalText(200),
  productDescription: optionalText(2000),
  businessModel: optionalText(1000),
  teamDescription: optionalText(2000),
  websiteUrl: WebUrl.nullable().optional(),
  fundingPurposes: z.array(FundingPurpose).max(10).optional(),
  fundingPurposeText: optionalText(2000),
  currency: Currency.optional(),
  targetAmountMinor: PositiveAmountMinor.nullable().optional(),
  minAmountMinor: PositiveAmountMinor.nullable().optional(),
  maxAmountMinor: PositiveAmountMinor.nullable().optional(),
  fundingDeadline: CalendarDate.nullable().optional(),
};

export const CreateStartupRequest = z
  .strictObject(startupFields)
  .meta({ id: 'CreateStartupRequest' });
export type CreateStartupRequest = z.input<typeof CreateStartupRequest>;

/** Partial update with optimistic concurrency (`version` from the last read). */
export const UpdateStartupRequest = z
  .strictObject({
    ...startupFields,
    name: requiredText(80).optional(),
    version: z.int().positive(),
  })
  .meta({ id: 'UpdateStartupRequest' });
export type UpdateStartupRequest = z.input<typeof UpdateStartupRequest>;

export const MilestoneInput = z
  .strictObject({
    title: requiredText(120),
    description: requiredText(2000),
    targetAmountMinor: PositiveAmountMinor,
    targetDate: CalendarDate.nullable().optional(),
  })
  .meta({ id: 'MilestoneInput' });
export type MilestoneInput = z.input<typeof MilestoneInput>;

/** `PUT /startups/{id}/milestones`: replaces the ordered list atomically. */
export const ReplaceMilestonesRequest = z
  .strictObject({
    milestones: z.array(MilestoneInput.extend({ id: Uuid.optional() })).max(20),
    version: z.int().positive(),
  })
  .meta({ id: 'ReplaceMilestonesRequest' });
export type ReplaceMilestonesRequest = z.input<typeof ReplaceMilestonesRequest>;

export const Milestone = z
  .object({
    id: Uuid,
    position: z.int(),
    title: z.string(),
    description: z.string(),
    targetAmountMinor: AmountMinor,
    currency: Currency,
    targetDate: IsoDate.nullable(),
  })
  .meta({ id: 'Milestone' });
export type Milestone = z.infer<typeof Milestone>;

/** Public card data of a published startup. */
export const StartupSummary = z
  .object({
    id: Uuid,
    slug: z.string(),
    name: z.string(),
    tagline: z.string().nullable(),
    sector: Sector.nullable(),
    stage: Stage.nullable(),
    country: z.string().nullable(),
    fundingPurposes: z.array(FundingPurpose),
    currency: Currency,
    targetAmountMinor: AmountMinor.nullable(),
    minAmountMinor: AmountMinor.nullable(),
    maxAmountMinor: AmountMinor.nullable(),
    fundingDeadline: IsoDate.nullable(),
    /** Sum of completed deals as reported by the parties (not verified by the platform). */
    reportedFundingMinor: AmountMinor,
    milestoneCount: z.int(),
    publishedAt: IsoDateTime.nullable(),
    founder: PersonSummary,
  })
  .meta({ id: 'StartupSummary' });
export type StartupSummary = z.infer<typeof StartupSummary>;

/** Public detail of a published startup. Never includes documents or private data. */
export const StartupDetail = StartupSummary.extend({
  description: z.string().nullable(),
  problem: z.string().nullable(),
  solution: z.string().nullable(),
  targetMarket: z.string().nullable(),
  productDescription: z.string().nullable(),
  businessModel: z.string().nullable(),
  teamDescription: z.string().nullable(),
  websiteUrl: z.string().nullable(),
  fundingPurposeText: z.string().nullable(),
  milestones: z.array(Milestone),
  founderHeadline: z.string().nullable(),
}).meta({ id: 'StartupDetail' });
export type StartupDetail = z.infer<typeof StartupDetail>;

export const RuleIssueSchema = z
  .object({ path: z.string(), code: z.string(), message: z.string() })
  .meta({ id: 'RuleIssue' });

/** The owner's view: everything plus status, version and what blocks publication. */
export const OwnedStartup = StartupDetail.extend({
  status: StartupStatusSchema,
  version: z.int(),
  archivedAt: IsoDateTime.nullable(),
  createdAt: IsoDateTime,
  updatedAt: IsoDateTime,
  publicationIssues: z.array(RuleIssueSchema),
}).meta({ id: 'OwnedStartup' });
export type OwnedStartup = z.infer<typeof OwnedStartup>;

export const OwnedStartupList = z
  .object({ data: z.array(OwnedStartup) })
  .meta({ id: 'OwnedStartupList' });

/** `POST /startups/{id}/publish|archive|unpublish` body. */
export const StartupVersionRequest = z.strictObject({ version: z.int().positive() });

export const STARTUP_SORTS = ['newest', 'deadline', 'target_asc', 'target_desc'] as const;

/** `GET /startups` (public search). */
export const StartupSearchQuery = z.strictObject({
  q: z.string().trim().max(100).optional(),
  sector: queryList(Sector),
  stage: queryList(Stage),
  country: queryList(Country),
  purpose: queryList(FundingPurpose),
  currency: Currency.optional(),
  /** Startups whose acceptable range overlaps [amountMin, amountMax] (minor units). */
  amountMin: AmountMinor.optional(),
  amountMax: AmountMinor.optional(),
  sort: z.enum(STARTUP_SORTS).default('newest'),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
export type StartupSearchQuery = z.input<typeof StartupSearchQuery>;

export const StartupPage = cursorPage(StartupSummary).meta({ id: 'StartupPage' });
export type StartupPage = z.infer<typeof StartupPage>;

/** The signed-in viewer's relationship with a startup (`GET /startups/{id}/relationship`). */
export const StartupRelationship = z
  .object({
    isOwner: z.boolean(),
    saved: z.boolean(),
    blocked: z.boolean(),
    connection: z
      .object({ id: Uuid, status: z.enum(['pending', 'accepted', 'declined', 'withdrawn']) })
      .nullable(),
    canRequestConnection: z.boolean(),
    /** Why a connection cannot be requested (`not_supporter`, `profile_incomplete`, ...). */
    requestBlockedReason: z.string().nullable(),
  })
  .meta({ id: 'StartupRelationship' });
export type StartupRelationship = z.infer<typeof StartupRelationship>;

// ── Recommendations ─────────────────────────────────────────────────────────

export const MATCH_FACTORS = ['sector', 'stage', 'funding_range', 'purpose', 'geography'] as const;
export type MatchFactor = (typeof MATCH_FACTORS)[number];

export const MatchFactorScore = z
  .object({
    factor: z.enum(MATCH_FACTORS),
    /** Weight in percent; the weights sum to 100. */
    weight: z.int(),
    /** 0-100: how well this factor matched. */
    score: z.int().min(0).max(100),
    /** Machine-readable reason, rendered by the client (`sector_match`, `range_outside`...). */
    reason: z.string(),
  })
  .meta({ id: 'MatchFactorScore' });
export type MatchFactorScore = z.infer<typeof MatchFactorScore>;

export const Recommendation = z
  .object({
    startup: StartupSummary,
    /** 0-100 weighted compatibility. A heuristic, not a prediction. */
    score: z.int().min(0).max(100),
    factors: z.array(MatchFactorScore),
    /** English explanation, for example "Recommended because ...". */
    explanation: z.string(),
  })
  .meta({ id: 'Recommendation' });
export type Recommendation = z.infer<typeof Recommendation>;

export const RecommendationPage = cursorPage(Recommendation).meta({ id: 'RecommendationPage' });
export type RecommendationPage = z.infer<typeof RecommendationPage>;

export const RecommendationQuery = z.strictObject({
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(12),
});
