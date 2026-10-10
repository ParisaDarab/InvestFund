# @investfund/web

InvestFund's Next.js (App Router) frontend.

## Stack

Next.js 16 (Turbopack), React 19, TypeScript (strict), Tailwind CSS 4, next-intl 4, next-themes,
TanStack Query 5, React Hook Form 7, Zod 4, Radix UI primitives (shadcn/ui style wrappers),
lucide-react icons and MSW 2 (API mocking for tests and the dev opt-in). Component tests use
Testing Library on jsdom.
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
pnpm --filter @investfund/web msw:init   # generate public/mockServiceWorker.js (see "API mocking")
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
    (app)/layout.tsx        app shell placeholder (renders the dev-only API status badge)
    (app)/app/              "/app" placeholder, error.tsx, not-found.tsx
    (dev)/dev/ui/           internal design-system showcase (see "Design system" below)
  components/ui/            themed primitives: Button, Card, Badge/StatusPill, Input, Label, Textarea,
                            Select, Checkbox, Dialog, Sheet, Tabs, Toast, Tooltip, Skeleton
  components/theme/         ThemeToggle
  components/brand/         Logo (placeholder wordmark with accent dot)
  components/providers/     ThemeProvider (dark default, class strategy) + QueryClientProvider
  components/feedback/      shared error and not-found states
  components/dev/           dev-only API status badge (DevApiStatus server wrapper + client badge)
  i18n/                     routing (en-GB only), request config, locale-aware navigation
  lib/api/client.ts         apiFetch, ApiError, access-token provider hook, Retry-After parsing
  lib/api/problem-form.ts   applyProblemToForm: problem+json errors[] -> React Hook Form fields
  lib/api/query.ts          createQueryKeys factory, retryOnceOnNetworkError
  lib/api/health.ts         healthKeys, fetchHealthReport, useHealth (GET /health/ready)
  lib/cn.ts                 class-name joiner (no tailwind-merge: see the comment in the file)
  lib/dev-ui.ts             whether internal dev pages are served
  lib/env.ts                Zod validation of public env
  lib/query-client.ts       TanStack Query defaults (queries retry 1, mutations never, no focus refetch)
  lib/security-headers.ts   CSP baseline and security headers (applied in next.config.ts)
  messages/en-GB.json       every user-visible string
  mocks/handlers/           MSW handlers per domain (health) and the default handler list
  mocks/node.ts             MSW server for Vitest (test/support/msw.ts wires its lifecycle)
  mocks/browser.ts          MSW browser worker for the dev opt-in
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

## API client

Every API call goes through `apiFetch` in `src/lib/api/client.ts`, wrapped in one TanStack Query
hook per endpoint (`useHealth()` in `lib/api/health.ts` is the example):

```ts
const report = await apiFetch('/health/ready', { schema: HealthReport, prefix: false });
const startup = await apiFetch(`/startups/${id}`, { schema: Startup }); // -> /api/v1/startups/{id}
```

- URL: `NEXT_PUBLIC_API_URL` + `/api/v1` + path. `prefix: false` skips `/api/v1` for the system
  endpoints that the API serves at its root (`/health/live`, `/health/ready`).
- JSON in and out; `credentials: 'include'` only for `/auth/*` (the refresh cookie is scoped to
  `/api/v1/auth`), `omit` otherwise.
- `Authorization: Bearer` comes from `setAccessTokenProvider()` (no-op until the P1 auth session).
  The provider is only read in the browser, never on the server, so tokens cannot leak between
  requests.
- Success bodies are parsed with the shared Zod schema. `acceptStatuses` lists non-2xx statuses that
  are normal responses (`/health/ready` answers `503 HealthReport`).
- Every failure is an `ApiError` with `kind`: `problem` (problem+json body in `problem`, field
  errors in `fieldErrors`), `http` (error status without a problem body), `contract` (the body does
  not match the schema: a bug, logged to the console in development only, without the body) or
  `network` (no response). `status`, `requestId` and `retryAfterSeconds` (from `Retry-After`) are
  set when known. Aborted requests rethrow the original `AbortError`.
- Never log tokens or response bodies.
- Forms: `applyProblemToForm(error, form)` puts `errors[]` (`email` or `body.email`) on React Hook
  Form fields and focuses the first one; it returns the `unmatched` errors for a summary or toast.
- Queries: build keys with `createQueryKeys('<domain>')`; `retryOnceOnNetworkError` is the `retry`
  predicate for reads that should survive a network blip but never repeat a 4xx/5xx.

The dev-only **API status badge** (bottom left of the app shell) shows `useHealth()`: checking,
ready, not ready (503), unreachable or unexpected response. It is rendered in `next dev` and left
out of production builds unless `INVESTFUND_DEV_UI=true`, like the UI showcase.

## API mocking (MSW)

Handlers live in `src/mocks/handlers/` (one file per domain, exported through `handlers/index.ts`).

- **Tests:** call `setupMswServer()` from `test/support/msw.ts` at the top of a test file. Unhandled
  requests fail the test; override per test with `server.use(...)`. `vitest.config.ts` sets
  `NEXT_PUBLIC_API_URL=http://api.test`. Tests run in Node; files that need a DOM start with
  `// @vitest-environment jsdom` and render with Testing Library (call `cleanup()` in `afterEach`).
- **Development (opt-in):** generate the worker once (and after MSW upgrades), then start the dev
  server with the flag:

  ```bash
  pnpm --filter @investfund/web msw:init        # writes public/mockServiceWorker.js (gitignored)
  # apps/web/.env.local
  NEXT_PUBLIC_API_MOCKING=enabled
  ```

  Browser requests with a handler are answered by MSW; everything else goes to the real API.
  Server Component requests are not mocked. The worker only starts under `next dev`: in a
  production build `NODE_ENV` is `production`, the check is the literal `false` and MSW is not
  bundled at all. The worker file is generated, not committed, so it is never deployed; ESLint and
  Prettier ignore it.

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
