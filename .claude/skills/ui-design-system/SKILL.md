---
name: ui-design-system
description: Frontend procedure for implementing InvestFund's visual design system (derived from the evalyze.ai benchmark, own brand) - tokens, theming, typography, layout patterns, shadcn/ui theming and accessibility. Use when creating or styling any UI.
---

# UI design system

The source of truth is `docs/DESIGN_SYSTEM.md`. This skill describes how to apply it.

## Tokens → Tailwind

- Define CSS variables in `apps/web/src/styles/globals.css` under `:root` (light) and `.dark` (dark, the default). Map them in `tailwind.config.ts`: `background`, `foreground`, `muted`, `card`, `border`, `primary` (brand accent), `primary-foreground`, `success`, `warning`, `destructive`, `ring`.
- Use semantic classes only (`bg-background`, `text-muted-foreground`). Never use raw hex or palette classes such as `bg-zinc-900` in components.
- Theme switching uses `next-themes` with `attribute="class"` and `defaultTheme="dark"`.

## Typography

Inter through `next/font/google`.

| Use | Size |
|---|---|
| Display | `text-5xl md:text-7xl font-bold tracking-tight` |
| H2 | `text-3xl md:text-5xl font-bold` |
| Body | `text-base text-muted-foreground` |

Highlight one word of each hero heading with `text-primary`.

## Patterns (benchmark-derived)

| Pattern | Spec |
|---|---|
| Hero | Grid background (CSS `background-image` linear-gradient lines at 64px, masked radial fade), badge "Trusted by N founders", display heading, subline, primary CTA, "No card required" note, product screenshot card with a glow below it |
| Nav | Sticky, translucent `backdrop-blur`, logo on the left, links in the centre (Product ▾, How it works, Pricing, Resources ▾), "Sign in" as a white solid button |
| Feature block | Two columns that alternate sides: an eyebrow, an H2, a body, a paired CTA (primary and ghost), and a UI preview card |
| Steps | A numbered 5-step "How it works" |
| Pricing | Cards; the highlighted plan gets a primary border |
| App shell | Left sidebar (role-aware nav), top bar with campaign switcher, theme toggle and avatar; content max-width 1280 |
| Data | Score rings (0–100), match cards with a score breakdown and an "AI rationale" disclosure, status pills |

## Components

Use shadcn/ui primitives (Button, Card, Dialog, Sheet, Tabs, Form, Table, Badge, Progress, Toast, Command) themed with the tokens. Wrap them in `components/ui`. Feature components never restyle primitives ad hoc.

## Accessibility

Contrast is at least 4.5:1 in both themes. Focus rings are visible (`ring-2 ring-ring`). Motion respects `prefers-reduced-motion`. Every form field has a label and error text linked through `aria-describedby`.
