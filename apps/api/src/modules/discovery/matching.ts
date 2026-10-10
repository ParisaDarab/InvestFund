/**
 * Deterministic, weighted compatibility scoring for supporter recommendations
 * (docs/MATCHING.md). No AI is involved.
 *
 * Each factor yields a score from 0 to 100 and a reason code; the total is the weighted average.
 * The weights are product heuristics chosen to reflect what supporters say matters most (sector
 * first, then whether the ask fits their budget, then stage), not validated predictions. They
 * live in one table so they are easy to tune.
 *
 * Missing information never earns full marks: "no preference" scores 50 (neutral) and missing
 * startup data scores 0, so an incomplete pair cannot reach 100.
 */
import { STAGES, type MatchFactor, type MatchFactorScore } from '@investfund/shared';

export const DEFAULT_MATCH_WEIGHTS: Readonly<Record<MatchFactor, number>> = {
  sector: 30,
  funding_range: 25,
  stage: 20,
  purpose: 15,
  geography: 10,
};

/** Score for "the supporter expressed no preference" — neutral, never perfect. */
export const NO_PREFERENCE_SCORE = 50;

export interface SupporterPreferences {
  readonly sectors: readonly string[];
  readonly stages: readonly string[];
  readonly purposes: readonly string[];
  readonly countries: readonly string[];
  readonly fundingMinMinor: bigint | null;
  readonly fundingMaxMinor: bigint | null;
  readonly currency: string;
}

export interface MatchableStartup {
  readonly sector: string | null;
  readonly stage: string | null;
  readonly country: string | null;
  readonly fundingPurposes: readonly string[];
  readonly currency: string;
  readonly targetAmountMinor: bigint | null;
  readonly minAmountMinor: bigint | null;
  readonly maxAmountMinor: bigint | null;
}

export interface MatchResult {
  readonly score: number;
  readonly factors: MatchFactorScore[];
  readonly explanation: string;
}

interface FactorOutcome {
  score: number;
  reason: string;
}

function sectorFactor(p: SupporterPreferences, s: MatchableStartup): FactorOutcome {
  if (s.sector === null) return { score: 0, reason: 'sector_unknown' };
  if (p.sectors.length === 0) return { score: NO_PREFERENCE_SCORE, reason: 'sector_any' };
  return p.sectors.includes(s.sector)
    ? { score: 100, reason: 'sector_match' }
    : { score: 0, reason: 'sector_mismatch' };
}

function stageFactor(p: SupporterPreferences, s: MatchableStartup): FactorOutcome {
  if (s.stage === null) return { score: 0, reason: 'stage_unknown' };
  if (p.stages.length === 0) return { score: NO_PREFERENCE_SCORE, reason: 'stage_any' };
  if (p.stages.includes(s.stage)) return { score: 100, reason: 'stage_match' };
  const index = (STAGES as readonly string[]).indexOf(s.stage);
  const adjacent = p.stages.some((stage) => {
    const other = (STAGES as readonly string[]).indexOf(stage);
    return index >= 0 && other >= 0 && Math.abs(index - other) === 1;
  });
  return adjacent
    ? { score: 50, reason: 'stage_adjacent' }
    : { score: 0, reason: 'stage_mismatch' };
}

function rangeFactor(p: SupporterPreferences, s: MatchableStartup): FactorOutcome {
  const { targetAmountMinor: target, minAmountMinor: min, maxAmountMinor: max } = s;
  if (target === null || min === null || max === null) return { score: 0, reason: 'range_unknown' };
  if (p.currency !== s.currency) return { score: 0, reason: 'currency_differs' };
  if (p.fundingMinMinor === null && p.fundingMaxMinor === null) {
    return { score: NO_PREFERENCE_SCORE, reason: 'range_any' };
  }
  // A missing bound is open-ended on that side.
  const low = p.fundingMinMinor ?? 0n;
  const high = p.fundingMaxMinor;
  const within = (value: bigint) => value >= low && (high === null || value <= high);
  // The supporter could fund the minimum acceptable amount the startup asks for.
  if (within(min) || within(target)) {
    return within(target)
      ? { score: 100, reason: 'range_target_fits' }
      : { score: 80, reason: 'range_minimum_fits' };
  }
  const overlaps = max >= low && (high === null || min <= high);
  return overlaps ? { score: 60, reason: 'range_overlap' } : { score: 0, reason: 'range_outside' };
}

function purposeFactor(p: SupporterPreferences, s: MatchableStartup): FactorOutcome {
  if (s.fundingPurposes.length === 0) return { score: 0, reason: 'purpose_unknown' };
  if (p.purposes.length === 0) return { score: NO_PREFERENCE_SCORE, reason: 'purpose_any' };
  return s.fundingPurposes.some((purpose) => p.purposes.includes(purpose))
    ? { score: 100, reason: 'purpose_match' }
    : { score: 0, reason: 'purpose_mismatch' };
}

function geographyFactor(p: SupporterPreferences, s: MatchableStartup): FactorOutcome {
  if (s.country === null) return { score: 0, reason: 'geography_unknown' };
  if (p.countries.length === 0) return { score: NO_PREFERENCE_SCORE, reason: 'geography_any' };
  return p.countries.includes(s.country)
    ? { score: 100, reason: 'geography_match' }
    : { score: 0, reason: 'geography_mismatch' };
}

const FACTORS: Readonly<
  Record<MatchFactor, (p: SupporterPreferences, s: MatchableStartup) => FactorOutcome>
> = {
  sector: sectorFactor,
  funding_range: rangeFactor,
  stage: stageFactor,
  purpose: purposeFactor,
  geography: geographyFactor,
};

const PHRASES: Readonly<Record<string, string>> = {
  sector_match: 'operates in your preferred sector',
  range_target_fits: 'is raising an amount within your stated range',
  range_minimum_fits: 'accepts an amount within your stated range',
  range_overlap: 'has an acceptable range that overlaps yours',
  stage_match: 'is at a stage you support',
  stage_adjacent: 'is one stage away from those you support',
  purpose_match: 'needs funding for a purpose you care about',
  geography_match: 'is based in a market you prefer',
};

function explain(factors: readonly MatchFactorScore[]): string {
  const phrases = factors.flatMap((f) =>
    PHRASES[f.reason] === undefined ? [] : [PHRASES[f.reason]],
  );
  if (phrases.length === 0) {
    return 'Shown because it is open for funding, although it matches few of your stated preferences.';
  }
  const list =
    phrases.length === 1
      ? phrases[0]
      : `${phrases.slice(0, -1).join(', ')}, and ${phrases[phrases.length - 1] ?? ''}`;
  return `Recommended because this startup ${list ?? ''}.`;
}

export function scoreMatch(
  preferences: SupporterPreferences,
  startup: MatchableStartup,
  weights: Readonly<Record<MatchFactor, number>> = DEFAULT_MATCH_WEIGHTS,
): MatchResult {
  const factors = (Object.keys(FACTORS) as MatchFactor[]).map((factor): MatchFactorScore => {
    const outcome = FACTORS[factor](preferences, startup);
    return { factor, weight: weights[factor], score: outcome.score, reason: outcome.reason };
  });
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weighted = factors.reduce((sum, f) => sum + f.weight * f.score, 0);
  const score = totalWeight === 0 ? 0 : Math.round(weighted / totalWeight);
  return { score, factors, explanation: explain(factors) };
}

/** Stable ordering: score desc, then newest publication, then id. */
export function compareRecommendations(
  a: { score: number; publishedAt: Date | null; id: string },
  b: { score: number; publishedAt: Date | null; id: string },
): number {
  if (a.score !== b.score) return b.score - a.score;
  const at = a.publishedAt?.getTime() ?? 0;
  const bt = b.publishedAt?.getTime() ?? 0;
  if (at !== bt) return bt - at;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
