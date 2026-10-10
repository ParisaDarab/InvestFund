/** Reusable field schemas for the marketplace contracts. */
import { z } from 'zod';

import {
  COUNTRIES,
  FUNDING_PURPOSES,
  FUNDING_TYPES,
  REPORT_CATEGORIES,
  SECTORS,
  STAGES,
  isCalendarDate,
} from '../domain/index.js';

import { AmountMinor } from './common.js';

/** Trims, then requires 1..max characters. */
export const requiredText = (max: number) => z.string().trim().min(1).max(max);
/** Trims; an empty string becomes `null`. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .optional()
    .transform((value) => (value === undefined ? undefined : value === '' ? null : value));

export const Sector = z.enum(SECTORS).meta({ id: 'Sector' });
export type Sector = z.infer<typeof Sector>;
export const Stage = z.enum(STAGES).meta({ id: 'Stage' });
export type Stage = z.infer<typeof Stage>;
export const FundingPurpose = z.enum(FUNDING_PURPOSES).meta({ id: 'FundingPurpose' });
export type FundingPurpose = z.infer<typeof FundingPurpose>;
export const Country = z.enum(COUNTRIES).meta({ id: 'Country' });
export type Country = z.infer<typeof Country>;
export const FundingTypeSchema = z.enum(FUNDING_TYPES).meta({ id: 'FundingType' });
export const ReportCategorySchema = z.enum(REPORT_CATEGORIES).meta({ id: 'ReportCategory' });

/** A strictly positive amount in minor units. */
export const PositiveAmountMinor = AmountMinor.refine((value) => value !== '0', {
  error: 'Must be greater than zero.',
});

/** `YYYY-MM-DD` that is a real calendar date. */
export const CalendarDate = z
  .string()
  .refine(isCalendarDate, { error: 'Must be a valid date (YYYY-MM-DD).' })
  .meta({ description: 'Calendar date (`YYYY-MM-DD`).', example: '2027-03-31' });

/** An absolute `https:` (or `http:`) URL. Other schemes (`javascript:`) are rejected. */
export const WebUrl = z.url({ protocol: /^https?$/, error: 'Must be an http(s) URL.' }).max(255);

/** Comma-separated or repeated query values → array. */
export const queryList = <T extends z.ZodType>(item: T) =>
  z
    .preprocess((value) => {
      if (value === undefined || value === '') return undefined;
      const list: unknown[] = Array.isArray(value) ? (value as unknown[]) : [value];
      return list.flatMap((entry): unknown[] =>
        typeof entry === 'string' ? entry.split(',') : [entry],
      );
    }, z.array(item).max(30))
    .optional();

/** A short public view of a person (no email, no private profile fields). */
export const PersonSummary = z
  .object({
    id: z.uuid(),
    displayName: z.string(),
  })
  .meta({ id: 'PersonSummary' });
export type PersonSummary = z.infer<typeof PersonSummary>;
