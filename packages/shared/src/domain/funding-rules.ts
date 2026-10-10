/**
 * Funding-plan rules (docs/DOMAIN_RULES.md §1). One implementation used by the web forms (for
 * immediate feedback) and by the API (authoritative). Amounts are `bigint` minor units; no
 * floating point is involved anywhere.
 *
 * Documented rules:
 * 1. Every amount is a positive whole number of minor units.
 * 2. `min <= target <= max`: the target must sit inside the acceptable range.
 * 3. Each milestone is in the startup's currency and is positive.
 * 4. The milestone allocations together must not exceed the target (they may be lower: the
 *    remainder is unallocated general funding).
 * 5. A funding deadline, when set, must be a real calendar date and, at publication, not in the
 *    past.
 * 6. Publication additionally needs every required field and at least one milestone.
 */

export interface MilestoneAmount {
  readonly targetAmountMinor: bigint;
  readonly currency: string;
}

export interface FundingPlan {
  readonly currency: string;
  readonly targetAmountMinor: bigint | null;
  readonly minAmountMinor: bigint | null;
  readonly maxAmountMinor: bigint | null;
  /** `YYYY-MM-DD` or null. */
  readonly fundingDeadline: string | null;
  readonly milestones: readonly MilestoneAmount[];
}

export type RuleIssueCode =
  | 'required'
  | 'not_positive'
  | 'min_exceeds_max'
  | 'target_below_min'
  | 'target_above_max'
  | 'milestones_exceed_target'
  | 'milestone_currency_mismatch'
  | 'milestone_required'
  | 'deadline_invalid'
  | 'deadline_past';

export interface RuleIssue {
  /** Field path, for example `minAmountMinor` or `milestones.1.targetAmountMinor`. */
  readonly path: string;
  readonly code: RuleIssueCode;
  readonly message: string;
}

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True for a real `YYYY-MM-DD` calendar date (rejects `2026-02-30`). */
export function isCalendarDate(value: string): boolean {
  const match = DATE.exec(value);
  if (match === null) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

/** Today's UTC date as `YYYY-MM-DD`. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export interface FundingCheckOptions {
  /** Publication mode: missing amounts and milestones become `required` issues. */
  readonly requireComplete: boolean;
  /** `YYYY-MM-DD` used for the deadline check (publication only). */
  readonly today?: string;
}

/** Checks a funding plan; returns every broken rule (empty when valid). */
export function checkFundingPlan(plan: FundingPlan, options: FundingCheckOptions): RuleIssue[] {
  const issues: RuleIssue[] = [];
  const add = (path: string, code: RuleIssueCode, message: string) =>
    issues.push({ path, code, message });

  const amounts = [
    ['targetAmountMinor', plan.targetAmountMinor, 'Target amount'],
    ['minAmountMinor', plan.minAmountMinor, 'Minimum acceptable amount'],
    ['maxAmountMinor', plan.maxAmountMinor, 'Maximum acceptable amount'],
  ] as const;
  for (const [path, value, label] of amounts) {
    if (value === null) {
      if (options.requireComplete) add(path, 'required', `${label} is required.`);
    } else if (value <= 0n) {
      add(path, 'not_positive', `${label} must be greater than zero.`);
    }
  }

  const { targetAmountMinor: target, minAmountMinor: min, maxAmountMinor: max } = plan;
  const positive = (value: bigint | null): value is bigint => value !== null && value > 0n;
  if (positive(min) && positive(max) && min > max) {
    add('minAmountMinor', 'min_exceeds_max', 'The minimum must not exceed the maximum.');
  }
  if (positive(target) && positive(min) && target < min) {
    add('targetAmountMinor', 'target_below_min', 'The target must not be below the minimum.');
  }
  if (positive(target) && positive(max) && target > max) {
    add('targetAmountMinor', 'target_above_max', 'The target must not exceed the maximum.');
  }

  let allocated = 0n;
  plan.milestones.forEach((milestone, index) => {
    if (milestone.targetAmountMinor <= 0n) {
      add(
        `milestones.${String(index)}.targetAmountMinor`,
        'not_positive',
        'Milestone amounts must be greater than zero.',
      );
    }
    if (milestone.currency !== plan.currency) {
      add(
        `milestones.${String(index)}.currency`,
        'milestone_currency_mismatch',
        'Milestones must use the startup currency.',
      );
    }
    allocated += milestone.targetAmountMinor;
  });
  if (positive(target) && allocated > target) {
    add(
      'milestones',
      'milestones_exceed_target',
      'Milestone allocations together must not exceed the target amount.',
    );
  }
  if (options.requireComplete && plan.milestones.length === 0) {
    add('milestones', 'milestone_required', 'Add at least one funding milestone.');
  }

  if (plan.fundingDeadline !== null) {
    if (!isCalendarDate(plan.fundingDeadline)) {
      add('fundingDeadline', 'deadline_invalid', 'The funding deadline is not a valid date.');
    } else if (options.requireComplete && plan.fundingDeadline < (options.today ?? utcToday())) {
      add('fundingDeadline', 'deadline_past', 'The funding deadline must not be in the past.');
    }
  }
  return issues;
}

/** Fields that must be present before a startup can be published. */
export const PUBLICATION_REQUIRED_FIELDS = [
  'name',
  'tagline',
  'description',
  'sector',
  'stage',
  'country',
  'fundingPurposes',
] as const;

export interface PublishableStartup extends FundingPlan {
  readonly name: string | null;
  readonly tagline: string | null;
  readonly description: string | null;
  readonly sector: string | null;
  readonly stage: string | null;
  readonly country: string | null;
  readonly fundingPurposes: readonly string[];
  readonly fundingPurposeText: string | null;
}

const FIELD_LABELS: Record<(typeof PUBLICATION_REQUIRED_FIELDS)[number], string> = {
  name: 'Startup name',
  tagline: 'Tagline',
  description: 'Description',
  sector: 'Technology sector',
  stage: 'Stage',
  country: 'Country or target market',
  fundingPurposes: 'Funding purpose',
};

/** Every reason the startup cannot be published yet (empty when it can). */
export function getPublicationIssues(startup: PublishableStartup, today?: string): RuleIssue[] {
  const issues: RuleIssue[] = [];
  for (const field of PUBLICATION_REQUIRED_FIELDS) {
    const value = startup[field];
    const missing =
      value === null || (typeof value === 'string' ? value.trim() === '' : value.length === 0);
    if (missing) {
      issues.push({
        path: field,
        code: 'required',
        message: `${FIELD_LABELS[field]} is required.`,
      });
    }
  }
  issues.push(...checkFundingPlan(startup, { requireComplete: true, ...(today ? { today } : {}) }));
  return issues;
}
