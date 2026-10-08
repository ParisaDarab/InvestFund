# Benchmark analysis: evalyze.ai

Analysed 2026-10-08. Use it for **structure and style reference only**. Never copy its copy text, logos, images or brand.

## Positioning
"AI that runs your fundraising" for pre-seed to Series A founders. The product is almost entirely founder-facing. Investors appear only as a footer link and a "verified investors" count.

## Product modules
| Module | Function | InvestFund equivalent |
|---|---|---|
| Startup Analyzer | Scores 6 areas, benchmarks by stage, lists fixes | FR-AI-03 |
| Pitch Deck Coach | Deck score 0–100, slide-by-slide feedback | FR-AI-04 |
| Investor Matching | Ranks investors by stage, sector, location, cheque size, history, thesis | FR-AI-02 (two-sided) |
| Outreach | Personalised drafts; founder approves and sends from own inbox | FR-AI-05, FR-OUT-02 |
| Reply Tracking | Who replied, who went quiet, follow-ups | FR-OUT-03, FR-AI-06 |
| Managed Fundraising | Paid done-for-you service | Out of scope |

## User flow
Analyze → improve deck → match investors → review and send → track replies. The dashboard is organised by **Campaign** (for example "Campaign 1" with filters: stage, location, cheque size, investor type).

## Landing page structure (in order)
1. Sticky nav: logo · Products ▾ · Managed Fundraising · Pricing · Resources ▾ · "Sign in" (white button)
2. Hero: social-proof pill with avatars, display H1 with one accent-coloured word, subline, primary CTA, "No card required"
3. Large dashboard preview card with a glow
4. Logo strip "Trusted by founders from …"
5. Four alternating feature blocks, each with a primary and a secondary CTA
6. Testimonials (circular photos)
7. "How it works": 5 numbered steps
8. Stats ("Built on real fundraising data")
9. Pricing (free Starter card; Pro mentioned)
10. Upsell section (managed service)
11. Blog/guides grid
12. Press logos
13. FAQ accordion
14. Closing CTA with an illustration
15. Footer: Product / Guides / Investor lists / Company columns, social links

## Visual language (measured)
- Dark theme by default: body `rgb(10,10,10)` = `#0A0A0A`, text `#FAFAFA`; light/dark toggle present
- Typeface: **Inter** (Next.js `next/font`); H1 72px, weight 700, tight tracking
- Accent: a warm peach/orange on one hero word, with gradient-dark CTA buttons
- Hero background: a faint square grid with some filled tiles, fading out radially
- Rounded cards (about 12–16px), thin low-contrast borders, soft shadows and glow
- Built on Next.js

## What InvestFund does beyond the benchmark
Two-sided marketplace (investor onboarding and deal flow), double opt-in, tiered data visibility, Calendar scheduling, in-app messaging, admin-configurable LLM, UK specifics (SEIS/EIS, Companies House, FCA promotion rules).
