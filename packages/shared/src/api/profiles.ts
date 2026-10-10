/** Founder and supporter profile contracts (docs/API.md §6.2). */
import { z } from 'zod';

import { checkSupporterRange } from '../domain/supporter-rules.js';

import { AmountMinor, Currency, IsoDateTime, Uuid } from './common.js';
import {
  Country,
  FundingPurpose,
  PositiveAmountMinor,
  Sector,
  Stage,
  WebUrl,
  optionalText,
  requiredText,
} from './fields.js';

export const FounderProfileInput = z
  .strictObject({
    displayName: requiredText(80),
    headline: optionalText(120),
    bio: optionalText(2000),
    country: Country.nullable().optional(),
    linkedinUrl: WebUrl.nullable().optional(),
  })
  .meta({ id: 'FounderProfileInput' });
export type FounderProfileInput = z.input<typeof FounderProfileInput>;

export const FounderProfile = z
  .object({
    userId: Uuid,
    displayName: z.string(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    country: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'FounderProfile' });
export type FounderProfile = z.infer<typeof FounderProfile>;

export const SupporterProfileInput = z
  .strictObject({
    displayName: requiredText(80),
    bio: optionalText(2000),
    sectors: z.array(Sector).max(30).default([]),
    stages: z.array(Stage).max(10).default([]),
    purposes: z.array(FundingPurpose).max(20).default([]),
    countries: z.array(Country).max(40).default([]),
    fundingMinMinor: PositiveAmountMinor.nullable().optional(),
    fundingMaxMinor: PositiveAmountMinor.nullable().optional(),
    currency: Currency.default('GBP'),
  })
  .superRefine((value, ctx) => {
    for (const issue of checkSupporterRange(value.fundingMinMinor, value.fundingMaxMinor)) {
      ctx.addIssue({ code: 'custom', path: [issue.path], message: issue.message });
    }
  })
  .meta({ id: 'SupporterProfileInput' });
export type SupporterProfileInput = z.input<typeof SupporterProfileInput>;

export const SupporterProfile = z
  .object({
    userId: Uuid,
    displayName: z.string(),
    bio: z.string().nullable(),
    sectors: z.array(Sector),
    stages: z.array(Stage),
    purposes: z.array(FundingPurpose),
    countries: z.array(Country),
    fundingMinMinor: AmountMinor.nullable(),
    fundingMaxMinor: AmountMinor.nullable(),
    currency: Currency,
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'SupporterProfile' });
export type SupporterProfile = z.infer<typeof SupporterProfile>;

/** What a founder sees about a supporter who contacted them (no email, no preferences). */
export const PublicSupporter = z
  .object({
    id: Uuid,
    displayName: z.string(),
    bio: z.string().nullable(),
  })
  .meta({ id: 'PublicSupporter' });
export type PublicSupporter = z.infer<typeof PublicSupporter>;

export const PublicFounder = z
  .object({
    id: Uuid,
    displayName: z.string(),
    headline: z.string().nullable(),
    bio: z.string().nullable(),
    linkedinUrl: z.string().nullable(),
  })
  .meta({ id: 'PublicFounder' });
export type PublicFounder = z.infer<typeof PublicFounder>;
