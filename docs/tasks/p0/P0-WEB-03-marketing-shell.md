# P0-WEB-03: Marketing layout shell (nav, hero, footer, placeholder routes)
Owner: frontend        Estimate: M
Requirements: PRD §10, NFR-PERF-01 (LCP budget), NFR-A11Y-01, NFR-I18N-01
Depends on: P0-WEB-02

## Goal
The benchmark-style marketing frame (structure and style only, never the benchmark's copy or assets) that P1 fills with real content: sticky blurred navigation, grid-background hero with the dashboard-preview card and glow, footer, and routes for every marketing page.

## Scope
- In: `(marketing)/layout.tsx` with a sticky translucent nav (logo left; links Product, How it works, For founders, For investors, Pricing, FAQ; "Sign in" as a solid button; mobile menu in a Sheet), footer (Product, Company, Legal columns; theme toggle); landing page hero (eyebrow pill, display heading with one `text-primary` word, subline, primary CTA "Get started" and a secondary CTA, a short reassurance note in our own words (for example "Free during beta"), a product-preview card placeholder with the primary glow) on the masked 64 px grid background; empty section scaffolds in landing order from `docs/BENCHMARK_ANALYSIS.md` (feature blocks, steps, testimonials placeholder, pricing, FAQ, closing CTA); placeholder routes `/how-it-works`, `/for-founders`, `/for-investors`, `/pricing`, `/faq`, `/privacy`, `/terms` with titles and metadata; all copy in `en-GB.json` and written in InvestFund's own voice (`DESIGN_SYSTEM.md` "Voice").
- Out: final page copy, FAQ content, legal texts and the cookie banner (P1); auth pages (P1).

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none
- Inputs: `docs/BENCHMARK_ANALYSIS.md` (structure), `docs/DESIGN_SYSTEM.md` (layout and voice)

## Acceptance criteria
1. Given the landing page at 375 px, 768 px and 1280 px widths, When rendered, Then there is no horizontal scroll and the nav collapses to a menu button below 768 px.
2. Given every marketing route, When requested, Then it returns 200 with a unique `<title>` and meta description from the message file.
3. Given keyboard-only use, When tabbing from the top of the page, Then a "Skip to content" link appears first and the mobile menu traps focus while open and closes on Escape.
4. Given a production build served locally, When Lighthouse runs on the landing page (mobile preset), Then LCP < 2.5 s and the accessibility score ≥ 95.
5. Given axe in Playwright, When run on every marketing route in both themes, Then there are no serious or critical violations.
6. Given the source, When searched, Then it contains no text, images or logos copied from evalyze.ai.

## Test requirements
- Unit: nav and footer render all links from config; mobile menu open and close.
- Integration: route metadata test.
- E2E / non-functional: Playwright responsive screenshots (light and dark), axe on all routes, Lighthouse CI run for the landing page.

## Notes / risks
- Keep the hero image as an optimised static asset or CSS so that it does not hurt LCP.
