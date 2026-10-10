import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MATCH_WEIGHTS,
  compareRecommendations,
  scoreMatch,
  type MatchableStartup,
  type SupporterPreferences,
} from '../matching.js';

const prefs = (overrides: Partial<SupporterPreferences> = {}): SupporterPreferences => ({
  sectors: ['clean_energy'],
  stages: ['prototype'],
  purposes: ['equipment'],
  countries: ['GB'],
  fundingMinMinor: 1_000_000n,
  fundingMaxMinor: 6_000_000n,
  currency: 'GBP',
  ...overrides,
});

const startup = (overrides: Partial<MatchableStartup> = {}): MatchableStartup => ({
  sector: 'clean_energy',
  stage: 'prototype',
  country: 'GB',
  fundingPurposes: ['equipment'],
  currency: 'GBP',
  targetAmountMinor: 5_000_000n,
  minAmountMinor: 1_000_000n,
  maxAmountMinor: 8_000_000n,
  ...overrides,
});

const factor = (result: ReturnType<typeof scoreMatch>, name: string) =>
  result.factors.find((f) => f.factor === name);

describe('scoreMatch', () => {
  it('weights sum to 100', () => {
    expect(Object.values(DEFAULT_MATCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('scores a perfect match 100 with a readable explanation', () => {
    const result = scoreMatch(prefs(), startup());
    expect(result.score).toBe(100);
    expect(result.explanation).toBe(
      'Recommended because this startup operates in your preferred sector, is raising an amount within your stated range, is at a stage you support, needs funding for a purpose you care about, and is based in a market you prefer.',
    );
  });

  it('never gives full marks when the supporter has no preferences', () => {
    const result = scoreMatch(
      prefs({
        sectors: [],
        stages: [],
        purposes: [],
        countries: [],
        fundingMinMinor: null,
        fundingMaxMinor: null,
      }),
      startup(),
    );
    expect(result.score).toBe(50);
  });

  it('gives zero for missing startup data instead of crashing', () => {
    const result = scoreMatch(
      prefs(),
      startup({
        sector: null,
        stage: null,
        country: null,
        fundingPurposes: [],
        targetAmountMinor: null,
      }),
    );
    expect(result.score).toBe(0);
    expect(result.factors.map((f) => f.reason)).toEqual([
      'sector_unknown',
      'range_unknown',
      'stage_unknown',
      'purpose_unknown',
      'geography_unknown',
    ]);
    expect(result.explanation).toMatch(/^Shown because/);
  });

  it('gives partial credit to adjacent stages', () => {
    const result = scoreMatch(prefs(), startup({ stage: 'mvp' }));
    expect(factor(result, 'stage')).toMatchObject({ score: 50, reason: 'stage_adjacent' });
    expect(scoreMatch(prefs(), startup({ stage: 'growth' })).factors[2]?.reason).toBe(
      'stage_mismatch',
    );
  });

  it('grades the funding range: target fits, minimum fits, overlap, outside, other currency', () => {
    expect(factor(scoreMatch(prefs(), startup()), 'funding_range')?.reason).toBe(
      'range_target_fits',
    );
    expect(
      factor(scoreMatch(prefs({ fundingMaxMinor: 2_000_000n }), startup()), 'funding_range')
        ?.reason,
    ).toBe('range_minimum_fits');
    expect(
      factor(
        scoreMatch(prefs({ fundingMinMinor: 9_000_000n, fundingMaxMinor: null }), startup()),
        'funding_range',
      ),
    ).toMatchObject({ score: 0, reason: 'range_outside' });
    expect(
      factor(
        scoreMatch(
          prefs({ fundingMinMinor: 100n, fundingMaxMinor: 500n }),
          startup({ minAmountMinor: 400n, targetAmountMinor: 900n, maxAmountMinor: 1000n }),
        ),
        'funding_range',
      ),
    ).toMatchObject({ reason: 'range_minimum_fits' });
    expect(
      factor(
        scoreMatch(
          prefs({ fundingMinMinor: 100n, fundingMaxMinor: 500n }),
          startup({ minAmountMinor: 600n, targetAmountMinor: 900n, maxAmountMinor: 1000n }),
        ),
        'funding_range',
      )?.reason,
    ).toBe('range_outside');
    expect(factor(scoreMatch(prefs(), startup({ currency: 'EUR' })), 'funding_range')?.reason).toBe(
      'currency_differs',
    );
  });

  it('is deterministic', () => {
    expect(scoreMatch(prefs(), startup({ stage: 'mvp' }))).toEqual(
      scoreMatch(prefs(), startup({ stage: 'mvp' })),
    );
  });
});

describe('compareRecommendations', () => {
  it('orders by score, then newest, then id', () => {
    const items = [
      { id: 'b', score: 80, publishedAt: new Date('2026-01-01') },
      { id: 'a', score: 80, publishedAt: new Date('2026-01-01') },
      { id: 'c', score: 90, publishedAt: new Date('2025-01-01') },
      { id: 'd', score: 80, publishedAt: new Date('2026-02-01') },
    ];
    expect([...items].sort(compareRecommendations).map((i) => i.id)).toEqual(['c', 'd', 'a', 'b']);
  });
});
