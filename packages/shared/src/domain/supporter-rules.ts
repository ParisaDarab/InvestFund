/** Supporter preference rules (docs/DOMAIN_RULES.md §1.2). */
import type { RuleIssue } from './funding-rules.js';

/** The preferred funding range: both optional, but when both are given `min <= max`. */
export function checkSupporterRange(
  min: string | null | undefined,
  max: string | null | undefined,
): RuleIssue[] {
  if (min == null || max == null) return [];
  if (!/^\d+$/.test(min) || !/^\d+$/.test(max)) return [];
  return BigInt(min) > BigInt(max)
    ? [
        {
          path: 'fundingMinMinor',
          code: 'min_exceeds_max',
          message: 'The minimum must not exceed the maximum.',
        },
      ]
    : [];
}
