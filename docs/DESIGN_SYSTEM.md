# InvestFund design system

Status: **Proposed. The brand colour needs human approval.**
Style is derived from the benchmark (`BENCHMARK_ANALYSIS.md`) with InvestFund's own identity.

## Brand
- Name: **InvestFund** (working name)
- Logo: a wordmark in Inter Bold with an accent dot, the same idea as the benchmark but in our colour. Replace it when a real logo exists.
- Accent: **Emerald (growth / capital)**, a deliberate contrast to the benchmark's peach.

## Colour tokens

| Token | Dark (default) | Light |
|---|---|---|
| `--background` | `#0A0A0A` | `#FFFFFF` |
| `--foreground` | `#FAFAFA` | `#0A0A0A` |
| `--card` | `#111111` | `#FAFAFA` |
| `--muted` | `#1A1A1A` | `#F4F4F5` |
| `--muted-foreground` | `#A1A1AA` | `#52525B` |
| `--border` | `#262626` | `#E4E4E7` |
| `--primary` (accent) | `#34D399` | `#047857` |
| `--primary-foreground` | `#052E1B` | `#FFFFFF` |
| `--ring` | `#34D399` | `#047857` |
| `--success` | `#22C55E` | `#15803D` |
| `--warning` | `#F59E0B` | `#B45309` |
| `--destructive` | `#F87171` | `#B91C1C` |
| `--grid-line` | `rgba(255,255,255,0.05)` | `rgba(0,0,0,0.05)` |

All text and background pairs meet a contrast ratio of at least 4.5:1. Verify any change with an automated contrast check.

## Typography
Inter (`next/font/google`, variable).
| Style | Class |
|---|---|
| Display | `text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]` |
| H1 (app) | `text-3xl font-semibold tracking-tight` |
| H2 | `text-3xl md:text-5xl font-bold tracking-tight` |
| H3 | `text-xl font-semibold` |
| Body | `text-base leading-7` |
| Small/meta | `text-sm text-muted-foreground` |
| Numbers | `tabular-nums` |

## Shape, space, depth
- Radius: `sm 6px`, `md 10px`, `lg 14px` (cards), `full` (pills, avatars)
- Spacing: Tailwind 4px scale; marketing section padding `py-24 md:py-32`; app content `p-6`
- Borders: 1px `--border`
- Glow for the hero preview: `box-shadow: 0 0 120px -20px color-mix(in srgb, var(--primary) 35%, transparent)`
- Motion: 150–250ms ease-out; disabled under `prefers-reduced-motion`

## Components (shadcn/ui, themed)
Button (primary / secondary / ghost / outline / destructive), Card, Badge/StatusPill, ScoreRing (0–100), MatchCard (score, breakdown bars, rationale disclosure, actions), Stepper (wizard), FileDropzone, DraftReviewPanel (email and meeting approval), PipelineBoard (campaign kanban), DataTable, EmptyState, Toast, Dialog, Sheet, CommandMenu.

## Layouts
- **Marketing:** sticky blurred nav → grid hero → logo strip → alternating feature blocks → steps → testimonials → pricing → FAQ → CTA → footer.
- **App:** sidebar (role-aware: Founder: Dashboard, Profile, Analysis, Matches, Campaigns, Meetings, Messages; Investor: Dashboard, Thesis, Deal flow, Connections, Meetings, Messages; Admin: Users, Verification, LLM, Matching, Analytics, Audit) plus a top bar (campaign switcher, notifications, theme toggle, avatar).

## Voice
Plain, confident, founder-friendly. Avoid hype. Always make clear when content is AI-generated and that nothing is sent without approval.
