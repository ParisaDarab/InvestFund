# P0-WEB-01: Next.js App Router skeleton with i18n, theming and data providers
Owner: frontend        Estimate: M
Requirements: NFR-I18N-01, NFR-A11Y-01, NFR-MAINT-01
Depends on: P0-REPO-01

## Goal
A Next.js application with the route structure, providers and conventions that every later UI card plugs into: localised routes, route groups for marketing, auth and app areas, dark-default theming, and a data-fetching provider.

## Scope
- In: `apps/web` with Next.js App Router and TypeScript strict; `src/app/[locale]/` with route groups `(marketing)`, `(auth)` and `(app)` and placeholder pages (`/`, `/login`, `/app`); next-intl with `en-GB` as the only and default locale, messages in `src/messages/en-GB.json`, middleware for locale prefixing, and an ESLint rule or test that flags hard-coded JSX text in components; `next-themes` provider (`attribute="class"`, `defaultTheme="dark"`, system option); TanStack Query provider with sensible defaults (retry 1 for queries, none for mutations, `refetchOnWindowFocus` off); Inter via `next/font/google`; Tailwind CSS configured (tokens arrive in P0-WEB-02); `src/lib/env.ts` validating `NEXT_PUBLIC_API_URL` with Zod; security headers in `next.config` (CSP baseline, `X-Content-Type-Options`, `Referrer-Policy`, frame-ancestors none); `error.tsx` and `not-found.tsx` per group; README.
- Out: design tokens and components (P0-WEB-02), marketing layout (P0-WEB-03), API client (P0-WEB-04), auth logic (P1).

## Contracts / inputs
- Endpoints: none
- Schemas: none
- Tables: none

## Acceptance criteria
1. Given `pnpm --filter web dev`, When `http://localhost:3000/` is opened, Then it redirects or rewrites to `/en-GB` and renders the placeholder landing page with HTTP 200.
2. Given no saved preference, When any page loads, Then the `<html>` element has class `dark`; toggling the theme persists across a reload without a flash of the wrong theme.
3. Given a visible string in a page component, When the i18n check runs, Then it comes from `en-GB.json` (the check fails on a fixture with hard-coded text).
4. Given `NEXT_PUBLIC_API_URL` is missing at build time, When `pnpm --filter web build` runs, Then it fails with a message naming the variable.
5. Given the production build, When response headers of `/en-GB` are inspected, Then the security headers listed in Scope are present.
6. Given `/en-GB/does-not-exist`, When requested, Then the localised not-found page renders with status 404.

## Test requirements
- Unit: env validation; providers render without errors (Testing Library).
- Integration: `next build` succeeds in CI.
- E2E / non-functional: Playwright smoke for criteria 1, 2 and 6 (added to the suite by P0-TEST-01) with axe showing no serious or critical violations.

## Notes / risks
- Use semantic token classes only from P0-WEB-02 onwards; no raw hex values in components.
