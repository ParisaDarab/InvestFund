# InvestFund design system

Status: **Current (v2).** Palette from the master brief: warm white, deep navy text, restrained teal accent.
Style is derived from the benchmark (`BENCHMARK_ANALYSIS.md`) with InvestFund's own identity.

## Brand
- Name: **InvestFund** (working name)
- Logo: a wordmark in Inter Bold with an accent dot, the same idea as the benchmark but in our colour. Replace it when a real logo exists.
- Accent: **Teal** (trust, growth), used sparingly for primary actions, links, focus and progress.
- Default theme: **light** (warm white). A dark theme is available from the theme toggle.

## Colour tokens

| Token | Dark | Light (default) |
|---|---|---|
| `--background` | `#0b1220` | `#fbfaf7` |
| `--foreground` | `#f3f1ec` | `#0f1b2d` |
| `--card` | `#111a2b` | `#ffffff` |
| `--muted` | `#172235` | `#f2f0ea` |
| `--muted-foreground` | `#a3adbd` | `#4a5568` |
| `--border` | `#24324a` | `#e3dfd5` |
| `--primary` (accent) | `#2dd4bf` | `#0f766e` |
| `--primary-foreground` | `#042f2e` | `#ffffff` |
| `--ring` | `#2dd4bf` | `#0f766e` |
| `--success` | `#4ade80` | `#166534` |
| `--warning` | `#fbbf24` | `#92400e` |
| `--destructive` | `#f87171` | `#b91c1c` |
| `--grid-line` | `rgba(255,255,255,0.05)` | `rgba(15,27,45,0.05)` |

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

## Components
Primitives (Radix, themed): Button, Card, Badge, Dialog, Sheet, Tabs, Select, Checkbox, Toast,
Tooltip, Input, Textarea, Label, Skeleton.

Product components: AppShell (sidebar, mobile sheet, top bar), StartupCard, FundingProgress,
MilestoneList, FilterBar, Pagination ("Load more"), ProfileSummary, ConnectionStatus,
ConversationList, ChatWindow, MessageBubble, OfferCard, OfferHistory, DealTimeline,
NotificationList, ConfirmDialog, EmptyState, ErrorState, LoadingSkeletons, MoneyInput,
MatchScore (score and factor bars).

## Layouts
- **Marketing:** a sticky nav, a hero with a product preview, how it works (three steps), the
  for-founders and for-supporters sections, a trust and safety section, a CTA and the footer.
  No fabricated statistics or testimonials.
- **App:** a role-aware sidebar (Founder: Dashboard, My startups, Connections, Messages, Deals,
  Notifications, Settings. Supporter: Dashboard, Discover, Recommended, Saved, Connections,
  Messages, Deals, Notifications, Settings. Admin: Overview, Reports), plus a top bar
  (notifications with an unread badge, theme toggle and profile menu). On mobile the sidebar
  becomes a sheet.

## Voice
Plain, warm and precise. Never imply that money moved through the platform or that anything is
verified. Say "reported" and "confirmed by the founder", not "paid".
