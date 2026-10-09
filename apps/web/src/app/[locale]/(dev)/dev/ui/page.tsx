import { Plus } from 'lucide-react';
import { notFound } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import { ToastDemo } from './toast-demo';

import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Badge, StatusPill } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { isDevUiEnabled } from '@/lib/dev-ui';

// Internal showcase of the design tokens and base primitives. Served in `next dev`; production
// builds only include it when INVESTFUND_DEV_UI=true (see src/lib/dev-ui.ts).
const enabled = isDevUiEnabled({
  NODE_ENV: process.env.NODE_ENV,
  INVESTFUND_DEV_UI: process.env.INVESTFUND_DEV_UI,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('devUi');
  return { title: t('metaTitle'), robots: { index: false, follow: false } };
}

/** Semantic colour utilities, one swatch per token. Full class names so Tailwind generates them. */
const swatches = [
  ['background', 'bg-background'],
  ['foreground', 'bg-foreground'],
  ['card', 'bg-card'],
  ['muted', 'bg-muted'],
  ['muted-foreground', 'bg-muted-foreground'],
  ['border', 'bg-border'],
  ['primary', 'bg-primary'],
  ['primary-foreground', 'bg-primary-foreground'],
  ['ring', 'bg-ring'],
  ['success', 'bg-success'],
  ['warning', 'bg-warning'],
  ['destructive', 'bg-destructive'],
  ['grid-line', 'bg-grid-line'],
] as const;

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="flex flex-col gap-4" data-testid={id}>
      <h2 id={`${id}-heading`} className="type-h3 border-b border-border pb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default function DevUiPage() {
  const t = useTranslations('devUi');
  if (!enabled) notFound();

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-12 p-6 md:py-12" data-testid="dev-ui">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Logo />
          <h1 className="type-h1">{t('title')}</h1>
          <p className="type-meta max-w-2xl">{t('description')}</p>
        </div>
        <ThemeToggle />
      </header>

      <Section id="typography" title={t('sections.typography')}>
        <p className="type-display">
          {t.rich('typography.display', {
            accent: (chunks) => <span className="text-primary">{chunks}</span>,
          })}
        </p>
        <p className="type-h1">{t('typography.h1')}</p>
        <p className="type-h2">{t('typography.h2')}</p>
        <p className="type-h3">{t('typography.h3')}</p>
        <p className="type-body text-muted-foreground max-w-2xl">{t('typography.body')}</p>
        <p className="type-meta">{t('typography.meta')}</p>
        <p className="text-2xl font-semibold tabular-nums">{t('typography.numbers')}</p>
      </Section>

      <Section id="colours" title={t('sections.colours')}>
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {swatches.map(([name, className]) => (
            <li key={name} className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className={`${className} size-10 shrink-0 rounded-md border border-border`}
              />
              <code className="text-sm">{name}</code>
            </li>
          ))}
        </ul>
      </Section>

      <Section id="buttons" title={t('sections.buttons')}>
        <div className="flex flex-wrap items-center gap-3">
          <Button>{t('buttons.primary')}</Button>
          <Button variant="secondary">{t('buttons.secondary')}</Button>
          <Button variant="outline">{t('buttons.outline')}</Button>
          <Button variant="ghost">{t('buttons.ghost')}</Button>
          <Button variant="destructive">{t('buttons.destructive')}</Button>
          <Button disabled>{t('buttons.disabled')}</Button>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm">{t('buttons.small')}</Button>
          <Button size="lg">{t('buttons.large')}</Button>
          <Button size="icon" variant="outline" aria-label={t('buttons.iconLabel')}>
            <Plus aria-hidden="true" />
          </Button>
        </div>
      </Section>

      <Section id="badges" title={t('sections.badges')}>
        <div className="flex flex-wrap items-center gap-3">
          <Badge>{t('badges.default')}</Badge>
          <Badge variant="primary">{t('badges.primary')}</Badge>
          <Badge variant="outline">{t('badges.outline')}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <StatusPill>{t('badges.neutral')}</StatusPill>
          <StatusPill tone="info">{t('badges.info')}</StatusPill>
          <StatusPill tone="success">{t('badges.success')}</StatusPill>
          <StatusPill tone="warning">{t('badges.warning')}</StatusPill>
          <StatusPill tone="danger">{t('badges.danger')}</StatusPill>
        </div>
      </Section>

      <Section id="card" title={t('sections.card')}>
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle>{t('card.title')}</CardTitle>
            <CardDescription>{t('card.description')}</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="type-body text-muted-foreground">{t('card.body')}</p>
            <div className="mt-3 flex gap-2">
              <StatusPill tone="success">{t('badges.success')}</StatusPill>
              <StatusPill tone="warning">{t('badges.warning')}</StatusPill>
              <StatusPill tone="danger">{t('badges.danger')}</StatusPill>
            </div>
          </CardContent>
          <CardFooter>
            <Button size="sm">{t('card.action')}</Button>
          </CardFooter>
        </Card>
      </Section>

      <Section id="form" title={t('sections.form')}>
        <form className="grid max-w-md gap-5" noValidate>
          <div className="grid gap-2">
            <Label htmlFor="dev-name">{t('form.nameLabel')}</Label>
            <Input
              id="dev-name"
              placeholder={t('form.namePlaceholder')}
              aria-describedby="dev-name-hint"
            />
            <p id="dev-name-hint" className="type-meta">
              {t('form.nameHint')}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dev-email">{t('form.emailLabel')}</Label>
            <Input
              id="dev-email"
              type="email"
              defaultValue={t('form.emailValue')}
              aria-invalid="true"
              aria-describedby="dev-email-error"
            />
            <p id="dev-email-error" className="text-destructive text-sm">
              {t('form.emailError')}
            </p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dev-summary">{t('form.summaryLabel')}</Label>
            <Textarea id="dev-summary" />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="dev-stage">{t('form.stageLabel')}</Label>
            <Select>
              <SelectTrigger id="dev-stage" data-testid="dev-stage">
                <SelectValue placeholder={t('form.stagePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pre-seed">{t('form.stages.preSeed')}</SelectItem>
                <SelectItem value="seed">{t('form.stages.seed')}</SelectItem>
                <SelectItem value="series-a">{t('form.stages.seriesA')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-3">
            <Checkbox id="dev-terms" />
            <Label htmlFor="dev-terms">{t('form.termsLabel')}</Label>
          </div>
        </form>
      </Section>

      <Section id="overlays" title={t('sections.overlays')}>
        <div className="flex flex-wrap items-center gap-3">
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline" data-testid="dev-open-dialog">
                {t('overlays.openDialog')}
              </Button>
            </DialogTrigger>
            <DialogContent data-testid="dev-dialog">
              <DialogHeader>
                <DialogTitle>{t('overlays.dialogTitle')}</DialogTitle>
                <DialogDescription>{t('overlays.dialogDescription')}</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose asChild>
                  <Button variant="ghost">{t('overlays.cancel')}</Button>
                </DialogClose>
                <DialogClose asChild>
                  <Button variant="destructive">{t('overlays.confirm')}</Button>
                </DialogClose>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Sheet>
            <SheetTrigger asChild>
              <Button variant="outline" data-testid="dev-open-sheet">
                {t('overlays.openSheet')}
              </Button>
            </SheetTrigger>
            <SheetContent data-testid="dev-sheet">
              <SheetHeader>
                <SheetTitle>{t('overlays.sheetTitle')}</SheetTitle>
                <SheetDescription>{t('overlays.sheetDescription')}</SheetDescription>
              </SheetHeader>
            </SheetContent>
          </Sheet>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost">{t('overlays.tooltipTrigger')}</Button>
            </TooltipTrigger>
            <TooltipContent>{t('overlays.tooltipContent')}</TooltipContent>
          </Tooltip>
        </div>
      </Section>

      <Section id="tabs" title={t('sections.tabs')}>
        <Tabs defaultValue="overview" className="max-w-md">
          <TabsList>
            <TabsTrigger value="overview">{t('tabs.overview')}</TabsTrigger>
            <TabsTrigger value="activity">{t('tabs.activity')}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview">
            <p className="type-body text-muted-foreground">{t('tabs.overviewBody')}</p>
          </TabsContent>
          <TabsContent value="activity">
            <p className="type-body text-muted-foreground">{t('tabs.activityBody')}</p>
          </TabsContent>
        </Tabs>
      </Section>

      <Section id="toast" title={t('sections.toast')}>
        <ToastDemo />
      </Section>

      <Section id="skeleton" title={t('sections.skeleton')}>
        <div className="flex max-w-md items-center gap-4" aria-busy="true">
          <Skeleton className="size-12 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <span className="sr-only">{t('skeleton.loading')}</span>
        </div>
      </Section>
    </main>
  );
}
