# Recommendation scoring

`apps/api/src/modules/discovery/matching.ts`. Deterministic and explainable; no AI.

| Factor | Weight | 100 | Partial | 0 | No supporter preference |
|---|---|---|---|---|---|
| Sector | 30 | startup sector ∈ preferred | — | otherwise, or sector unknown | 50 |
| Funding range | 25 | target within the supporter's range | 80: startup's minimum within range · 60: ranges overlap | outside, other currency, or amounts unknown | 50 |
| Stage | 20 | stage ∈ preferred | 50: adjacent stage | otherwise, or unknown | 50 |
| Purpose | 15 | any purpose overlaps | — | no overlap, or none set | 50 |
| Geography | 10 | country ∈ preferred | — | otherwise, or unknown | 50 |

Score = Σ(weight × factor score) / 100, rounded. Weights sum to 100.

**Rationale.** Sector fit is the strongest signal of supporter intent, so it carries the most
weight. Whether the ask fits the supporter's budget decides whether a conversation can lead
anywhere. Stage reflects risk appetite. Purpose and geography refine the result. These are
**product heuristics**, not validated predictions. Tune the table and the tests together.

**Missing data.** "No preference" is neutral (50), never perfect. Missing startup data scores 0.
A pair with incomplete information therefore cannot reach 100.

**Ordering.** Score descending, then the most recent publication, then id. The same inputs
always produce the same page order.

**Eligibility.** Only published startups whose founder is active, excluding the supporter's own
startups and any blocked pair. Each request scores at most the 500 most recently published
candidates (`RECOMMENDATION_CANDIDATE_LIMIT`). Past that size, precompute scores, or pre-filter
in SQL by currency and sector.

**Explanation.** One English sentence built from the matched factors, for example: "Recommended
because this startup operates in your preferred sector, is raising an amount within your stated
range, and is at a stage you support." Each factor also returns a reason code, which the web app
localises.
