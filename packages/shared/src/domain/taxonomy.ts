/**
 * Controlled vocabularies shared by forms, the API and the matching service. Values are stable
 * machine keys stored in the database; display labels live in the web app's message catalogue
 * (`taxonomy.*`), so adding a language never touches business logic.
 */

/** Technology sectors a startup operates in and supporters can prefer. */
export const SECTORS = [
  'ai_ml',
  'climate_tech',
  'clean_energy',
  'edtech',
  'fintech',
  'healthtech',
  'biotech',
  'agritech',
  'foodtech',
  'proptech',
  'mobility',
  'cybersecurity',
  'developer_tools',
  'saas',
  'marketplaces',
  'consumer_apps',
  'hardware_iot',
  'robotics',
  'space_tech',
  'social_impact',
  'govtech',
  'creative_tech',
  'other',
] as const;
export type SectorCode = (typeof SECTORS)[number];

/** Startup stages, ordered from earliest to latest (matching uses the order for adjacency). */
export const STAGES = ['idea', 'prototype', 'mvp', 'early_revenue', 'growth'] as const;
export type StageCode = (typeof STAGES)[number];

/** What the money is for. */
export const FUNDING_PURPOSES = [
  'product_development',
  'research',
  'hiring',
  'marketing',
  'equipment',
  'operations',
  'community_impact',
  'education_training',
  'expansion',
  'other',
] as const;
export type FundingPurposeCode = (typeof FUNDING_PURPOSES)[number];

/** Funding types of the MVP. Equity is out of scope (ADR 0002). */
export const FUNDING_TYPES = ['grant', 'donation'] as const;
export type FundingType = (typeof FUNDING_TYPES)[number];

/**
 * Currencies amounts may be recorded in. GBP is the default. No conversion is ever performed:
 * amounts in different currencies are never compared or summed.
 */
export const CURRENCIES = ['GBP', 'EUR', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];
export const DEFAULT_CURRENCY: CurrencyCode = 'GBP';

/**
 * Countries / markets offered in forms (ISO 3166-1 alpha-2). Curated for the UK-first launch;
 * extend the list (and the message catalogue) to open new markets.
 */
export const COUNTRIES = [
  'GB',
  'IE',
  'FR',
  'DE',
  'NL',
  'BE',
  'ES',
  'PT',
  'IT',
  'SE',
  'DK',
  'NO',
  'FI',
  'PL',
  'CH',
  'AT',
  'EE',
  'US',
  'CA',
  'AU',
  'NZ',
  'IN',
  'SG',
  'AE',
  'KE',
  'NG',
  'ZA',
  'GH',
  'BR',
  'MX',
] as const;
export type CountryCode = (typeof COUNTRIES)[number];

/** Report categories for profiles and listings. */
export const REPORT_CATEGORIES = [
  'spam',
  'fraud_or_scam',
  'misleading_information',
  'harassment',
  'inappropriate_content',
  'impersonation',
  'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const REPORT_TARGET_TYPES = ['user', 'startup'] as const;
export type ReportTargetType = (typeof REPORT_TARGET_TYPES)[number];

/** Outcomes an administrator can record when resolving a report. */
export const REPORT_ACTIONS = [
  'none',
  'warning_recorded',
  'startup_archived',
  'user_suspended',
] as const;
export type ReportAction = (typeof REPORT_ACTIONS)[number];
