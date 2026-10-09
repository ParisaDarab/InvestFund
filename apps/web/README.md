# @investfund/web

InvestFund's Next.js (App Router) frontend.

## Stack

Next.js 16 (Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, next-intl 4, next-themes,
TanStack Query 5, Zod 4, Radix UI primitives (shadcn/ui style wrappers) and lucide-react icons.
Inter is self-hosted through `next/font/google`.

## Running

```bash
# Required: the public API URL (validated by src/lib/env.ts; dev and build fail without it).
# Put it in apps/web/.env.local or export it in the shell.
NEXT_PUBLIC_API_URL=http://localhost:4000

pnpm --filter @investfund/web dev        # http://localhost:3000 -> redirects to /en-GB
pnpm --filter @investfund/web build
pnpm --filter @investfund/web start
pnpm --filter @investfund/web typecheck
pnpm --filter @investfund/web test       # or `pnpm test` at the repository root
```

Next.js reads `.env*` files from `apps/web`, not from the repository root.

## Layout

```
src/
  app/[locale]/
    layout.tsx              root layout: <html lang>, Inter, NextIntlClientProvider, Providers
    not-found.tsx           localised 404 (also used by [...rest] for unknown paths)
    [...rest]/page.tsx      catch-all -> notFound()
    (marketing)/            "/" landing placeholder, error.tsx, not-found.tsx
    (auth)/login/           "/login" placeholder, error.tsx, not-found.tsx
    (app)/app/              "/app" placeholder, error.tsx, not-found.tsx
    (dev)/dev/ui/           internal design-system showcase (see "Design system" below)
  components/ui/            themed primitives: Button, Card, Badge/StatusPill, Input, Label, Textarea,
                            Select, Checkbox, Dialog, Sheet, Tabs, Toast, Tooltip, Skeleton
  components/theme/         ThemeToggle
  components/brand/         Logo (placeholder wordmark with accent dot)
  components/providers/     ThemeProvider (dark default, class strategy) + QueryClientProvider
  components/feedback/      shared error and not-found states
  i18n/                     routing (en-GB only), request config, locale-aware navigation
  lib/cn.ts                 class-name joiner (no tailwind-merge: see the comment in the file)
  lib/dev-ui.ts             whether internal dev pages are served
  lib/env.ts                Zod validation of public env
  lib/query-client.ts       TanStack Query defaults (queries retry 1, mutations never, no focus refetch)
  lib/security-headers.ts   CSP baseline and security headers (applied in next.config.ts)
  messages/en-GB.json       every user-visible string
  proxy.ts                  next-intl locale prefixing (Next.js 16 name for middleware)
  styles/globals.css        Tailwind entry point: design tokens, theme mapping, typography, motion
```

## Conventions

- **No hard-coded UI copy.** Text must come from `src/messages/en-GB.json` via `useTranslations` /
  `getTranslations`. ESLint (`no-restricted-syntax`, configured in `eslint.i18n.mjs`) fails on JSX
  text, string literals rendered as children and literal `alt` / `title` / `placeholder` /
  `aria-label` values in `src/**/*.tsx`. Message keys are type-checked (`src/types/next-intl.d.ts`).
- Use `Link`, `redirect` and `useRouter` from `@/i18n/navigation`, not from `next/link`.
- Server Components by default; add `'use client'` only for interactivity.
- The locale comes from the `[locale]` root param via `next/root-params` (in `src/i18n/request.ts`),
  so pages need no `params` plumbing and stay statically renderable. Do not use the deprecated
  `setRequestLocale` / `requestLocale`.
- Server-side next-intl APIs must not be used in `not-found.tsx` (no route params there); the
  shared `NotFoundState` is a Client Component for that reason.
- Theme: `next-themes` with `attribute="class"`, `defaultTheme="dark"`, `enableSystem`. Do not
  read the theme during server rendering.
- Add `data-testid` hooks on key elements for Playwright.

## Design system

Source of truth: `docs/DESIGN_SYSTEM.md`. Tailwind 4 is configured in CSS (there is no
`tailwind.config.ts`):

- `src/styles/globals.css` holds the colour tokens as CSS variables, light on `:root` and dark on
  `.dark` (the default theme). `@theme inline` maps them to Tailwind colours (`bg-background`,
  `text-muted-foreground`, `bg-primary`, `ring-ring`, `text-success`, `bg-grid-line`, ...) and
  removes Tailwind's default palette, so `bg-zinc-900` does not exist. It also sets the radius
  scale (`rounded-sm` 6px, `rounded-md` 10px, `rounded-lg` 14px), `shadow-glow`, the motion
  keyframes and the typography utilities `type-display`, `type-h1`, `type-h2`, `type-h3`,
  `type-body` and `type-meta`.
- Under `prefers-reduced-motion: reduce` every animation and transition is switched off.
- `test/design-tokens.test.ts` checks that the CSS tokens equal the `DESIGN_SYSTEM.md` table and
  that every text/background pair is at least 4.5:1 (focus ring at least 3:1) in both themes. Run it
  after any token change.
- ESLint (`eslint.tokens.mjs`) fails on raw hex colours and Tailwind palette classes in
  `src/components` and `src/app`.
- Every interactive primitive uses the shared `focusRing` classes (`ring-2 ring-ring`, offset).
- `cn()` does not merge conflicting utilities. Primitives avoid base classes a caller would
  override; when a caller must win a conflict, use Tailwind's important modifier (`!p-0`).

The showcase at `/en-GB/dev/ui` lists the tokens and every primitive in the active theme. It is
served by `next dev`; production builds return 404 for it unless the build runs with
`INVESTFUND_DEV_UI=true` (used for the Playwright + axe check).

## Security headers

`next.config.ts` sends a baseline CSP (`frame-ancestors 'none'`, `object-src 'none'`, API origin in
`connect-src`), `X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a restrictive `Permissions-Policy` on
every route. `script-src` still allows `'unsafe-inline'` (Next.js inline RSC payload and the
next-themes anti-flash script); a nonce-based policy is a planned hardening step.

## next-intl plugin

`next.config.ts` sets the `next-intl/config` alias itself instead of using `next-intl/plugin`,
because that plugin eagerly loads `@swc/core` for its optional message extractor and the native
binding fails to load on some Windows hosts. Re-check next-intl's `getNextConfig` on upgrades.
