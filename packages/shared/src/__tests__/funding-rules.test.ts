import { describe, expect, it } from 'vitest';

import {
  checkFundingPlan,
  checkSupporterRange,
  getPublicationIssues,
  isCalendarDate,
  type FundingPlan,
  type PublishableStartup,
} from '../domain/index.js';

const plan = (overrides: Partial<FundingPlan> = {}): FundingPlan => ({
  currency: 'GBP',
  targetAmountMinor: 5_000_000n,
  minAmountMinor: 1_000_000n,
  maxAmountMinor: 8_000_000n,
  fundingDeadline: null,
  milestones: [{ targetAmountMinor: 2_000_000n, currency: 'GBP' }],
  ...overrides,
});

const codes = (issues: { code: string }[]) => issues.map((issue) => issue.code);

describe('checkFundingPlan', () => {
  it('accepts a consistent plan', () => {
    expect(checkFundingPlan(plan(), { requireComplete: true, today: '2026-10-10' })).toEqual([]);
  });

  it('allows partial drafts but requires every amount on publication', () => {
    const draft = plan({ targetAmountMinor: null, minAmountMinor: null, milestones: [] });
    expect(checkFundingPlan(draft, { requireComplete: false })).toEqual([]);
    expect(codes(checkFundingPlan(draft, { requireComplete: true }))).toEqual([
      'required',
      'required',
      'milestone_required',
    ]);
  });

  it('rejects zero and negative amounts', () => {
    const issues = checkFundingPlan(plan({ minAmountMinor: 0n, maxAmountMinor: -5n }), {
      requireComplete: false,
    });
    expect(issues.filter((issue) => issue.code === 'not_positive')).toHaveLength(2);
  });

  it('rejects a minimum above the maximum', () => {
    expect(
      codes(checkFundingPlan(plan({ minAmountMinor: 9_000_000n }), { requireComplete: false })),
    ).toContain('min_exceeds_max');
  });

  it('requires the target inside the acceptable range', () => {
    expect(
      codes(checkFundingPlan(plan({ targetAmountMinor: 500_000n }), { requireComplete: false })),
    ).toEqual(['target_below_min', 'milestones_exceed_target']);
    expect(
      codes(checkFundingPlan(plan({ targetAmountMinor: 9_000_000n }), { requireComplete: false })),
    ).toEqual(['target_above_max']);
  });

  it('accepts a target equal to the bounds', () => {
    const exact = plan({ minAmountMinor: 5_000_000n, maxAmountMinor: 5_000_000n });
    expect(checkFundingPlan(exact, { requireComplete: false })).toEqual([]);
  });

  it('rejects milestone allocations above the target but allows exactly the target', () => {
    const over = plan({
      milestones: [
        { targetAmountMinor: 3_000_000n, currency: 'GBP' },
        { targetAmountMinor: 2_000_001n, currency: 'GBP' },
      ],
    });
    expect(codes(checkFundingPlan(over, { requireComplete: false }))).toEqual([
      'milestones_exceed_target',
    ]);
    const exact = plan({
      milestones: [
        { targetAmountMinor: 3_000_000n, currency: 'GBP' },
        { targetAmountMinor: 2_000_000n, currency: 'GBP' },
      ],
    });
    expect(checkFundingPlan(exact, { requireComplete: false })).toEqual([]);
  });

  it('rejects milestones in another currency', () => {
    const issues = checkFundingPlan(
      plan({ milestones: [{ targetAmountMinor: 1n, currency: 'EUR' }] }),
      { requireComplete: false },
    );
    expect(issues).toEqual([
      expect.objectContaining({
        path: 'milestones.0.currency',
        code: 'milestone_currency_mismatch',
      }),
    ]);
  });

  it('validates the deadline', () => {
    expect(
      codes(checkFundingPlan(plan({ fundingDeadline: '2026-02-30' }), { requireComplete: false })),
    ).toEqual(['deadline_invalid']);
    expect(
      codes(
        checkFundingPlan(plan({ fundingDeadline: '2026-10-09' }), {
          requireComplete: true,
          today: '2026-10-10',
        }),
      ),
    ).toEqual(['deadline_past']);
    // Drafts may keep a past deadline; only publication rejects it.
    expect(
      checkFundingPlan(plan({ fundingDeadline: '2026-10-09' }), { requireComplete: false }),
    ).toEqual([]);
    expect(
      checkFundingPlan(plan({ fundingDeadline: '2026-10-10' }), {
        requireComplete: true,
        today: '2026-10-10',
      }),
    ).toEqual([]);
  });

  it('handles amounts beyond Number.MAX_SAFE_INTEGER exactly', () => {
    const huge = 9_007_199_254_740_993n;
    const issues = checkFundingPlan(
      plan({
        targetAmountMinor: huge,
        minAmountMinor: huge,
        maxAmountMinor: huge,
        milestones: [{ targetAmountMinor: huge, currency: 'GBP' }],
      }),
      { requireComplete: false },
    );
    expect(issues).toEqual([]);
  });
});

describe('getPublicationIssues', () => {
  const complete: PublishableStartup = {
    ...plan(),
    name: 'Solar Schools',
    tagline: 'Solar kits for rural schools',
    description: 'We build...',
    sector: 'clean_energy',
    stage: 'prototype',
    country: 'GB',
    fundingPurposes: ['equipment'],
    fundingPurposeText: null,
  };

  it('is empty for a complete startup', () => {
    expect(getPublicationIssues(complete, '2026-10-10')).toEqual([]);
  });

  it('lists every missing required field', () => {
    const issues = getPublicationIssues(
      { ...complete, tagline: '  ', sector: null, fundingPurposes: [], milestones: [] },
      '2026-10-10',
    );
    expect(issues.map((issue) => `${issue.path}:${issue.code}`)).toEqual([
      'tagline:required',
      'sector:required',
      'fundingPurposes:required',
      'milestones:milestone_required',
    ]);
  });
});

describe('isCalendarDate', () => {
  it.each([
    ['2028-02-29', true],
    ['2027-02-29', false],
    ['2026-13-01', false],
    ['2026-1-01', false],
    ['not a date', false],
  ])('%s → %s', (value, expected) => {
    expect(isCalendarDate(value)).toBe(expected);
  });
});

describe('checkSupporterRange', () => {
  it('accepts open-ended and ordered ranges', () => {
    expect(checkSupporterRange(null, '100')).toEqual([]);
    expect(checkSupporterRange('100', '100')).toEqual([]);
  });
  it('rejects min > max', () => {
    expect(checkSupporterRange('101', '100')).toHaveLength(1);
  });
});
