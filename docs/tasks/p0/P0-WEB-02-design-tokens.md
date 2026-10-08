# P0-WEB-02: Design tokens, theme and base UI primitives
Owner: frontend        Estimate: M
Requirements: NFR-A11Y-01, PRD §10, assumption A4 (InvestFund, emerald accent)
Depends on: P0-WEB-01

## Goal
Implement the InvestFund design system from `docs/DESIGN_SYSTEM.md` as CSS-variable tokens mapped into Tailwind, with themed shadcn/ui primitives, so that every later screen is consistent, accessible in both themes and free of ad-hoc colours.

## Scope
- In: `src/styles/globals.css` with every token from `DESIGN_SYSTEM.md` under `:root` (light) and `.dark` (dark default); `tailwind.config.ts` mapping (`background`, `foreground`, `card`, `muted`, `muted-foreground`, `border`, `primary`, `primary-foreground`, `ring`, `success`, `warning`, `destructive`, `grid-line`), radius scale (6/10/14 px), typography utilities from the design system, reduced-motion handling; shadcn/ui initialised and themed: Button (primary, secondary, ghost, outline, destructive), Card, Badge/StatusPill, Input, Label, Textarea, Select, Checkbox, Dialog, Sheet, Tabs, Toast, Tooltip, Skeleton; `components/ui` wrappers; ThemeToggle; Logo (wordmark with accent dot); an internal `/en-GB/dev/ui` showcase page (excluded from production builds or behind a dev flag); a contrast test script; an ESLint rule (or test) that forbids raw hex values and Tailwind palette classes such as `bg-zinc-900` in `src/components` and `src/app`.
- Out: feature components (ScoreRing, MatchCard and so on, built in the phases that need them); marketing sections (P0-WEB-03).

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none
- Source of truth: `docs/DESIGN_SYSTEM.md` colour tokens, typography, shape and motion

## Acceptance criteria
1. Given the token table in `DESIGN_SYSTEM.md`, When the contrast script runs, Then every text/background pair listed there (foreground on background, muted-foreground on background and card, primary-foreground on primary, destructive on background) is at least 4.5:1 in both themes.
2. Given the showcase page in both themes, When axe runs in Playwright, Then there are zero serious or critical violations.
3. Given a component file containing `className="bg-zinc-900"` or `#34D399`, When lint runs, Then it fails.
4. Given keyboard navigation through the showcase, When focus moves to any interactive primitive, Then a visible `ring` focus indicator is shown.
5. Given `prefers-reduced-motion: reduce`, When dialogs and toasts open, Then no transition animation runs.
6. Given the ThemeToggle, When activated by keyboard, Then the theme switches and the control exposes its state to assistive technology (`aria-pressed` or an accessible label that changes).

## Test requirements
- Unit: primitives render with expected variant classes (Testing Library); ThemeToggle behaviour.
- Integration: contrast script in CI.
- E2E / non-functional: Playwright + axe on the showcase in light and dark.

## Notes / risks
- The emerald accent depends on assumption A4. If the human changes the brand, only the tokens change.
