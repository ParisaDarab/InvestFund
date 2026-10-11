import {
  ArrowRight,
  FileLock2,
  Flag,
  HandCoins,
  MessagesSquare,
  Search,
  ShieldCheck,
  Sparkles,
  UserRoundCheck,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return { title: t('metaTitle') };
}

const STEPS = [
  { key: 'discover', icon: Search },
  { key: 'connect', icon: MessagesSquare },
  { key: 'fund', icon: HandCoins },
] as const;

const TRUST = [
  { key: 'noPayments', icon: ShieldCheck },
  { key: 'reported', icon: Flag },
  { key: 'documents', icon: FileLock2 },
  { key: 'moderation', icon: UserRoundCheck },
] as const;

export default function HomePage() {
  const t = useTranslations('home');
  return (
    <main data-testid="home">
      <section className="relative overflow-hidden border-b border-border">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,var(--grid-line)_1px,transparent_1px),linear-gradient(to_bottom,var(--grid-line)_1px,transparent_1px)] bg-[size:48px_48px]"
        />
        <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 sm:px-6 md:py-28 lg:grid-cols-[1.1fr_1fr]">
          <div className="space-y-6">
            <p className="text-primary inline-flex items-center gap-2 text-sm font-medium">
              <Sparkles aria-hidden="true" className="size-4" />
              {t('eyebrow')}
            </p>
            <h1 className="type-display text-balance">{t('title')}</h1>
            <p className="type-body text-muted-foreground max-w-xl text-lg">{t('description')}</p>
            <div className="flex flex-wrap gap-3">
              <Link
                href="/discover"
                className={buttonVariants({ size: 'lg' })}
                data-testid="home-discover"
              >
                {t('ctaDiscover')}
                <ArrowRight aria-hidden="true" />
              </Link>
              <Link
                href="/login"
                className={buttonVariants({ size: 'lg', variant: 'outline' })}
                data-testid="home-sign-in"
              >
                {t('ctaRaise')}
              </Link>
            </div>
            <p className="type-meta">{t('note')}</p>
          </div>
          <div
            className="bg-card shadow-glow rounded-lg border border-border p-6"
            aria-label={t('preview.label')}
          >
            <p className="type-meta mb-4 uppercase tracking-wide">{t('preview.example')}</p>
            <div className="space-y-4">
              <div>
                <p className="text-lg font-semibold">{t('preview.name')}</p>
                <p className="text-muted-foreground text-sm">{t('preview.tagline')}</p>
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="bg-muted rounded-full border border-border px-2.5 py-0.5">
                  {t('preview.sector')}
                </span>
                <span className="rounded-full border border-border px-2.5 py-0.5">
                  {t('preview.stage')}
                </span>
              </div>
              <div className="bg-muted h-2 rounded-full" aria-hidden="true">
                <div className="bg-primary h-full w-2/5 rounded-full" />
              </div>
              <ol className="space-y-2 text-sm">
                <li className="flex justify-between gap-4">
                  <span>{t('preview.milestone1')}</span>
                  <span className="tabular-nums">{t('preview.amount1')}</span>
                </li>
                <li className="flex justify-between gap-4">
                  <span>{t('preview.milestone2')}</span>
                  <span className="tabular-nums">{t('preview.amount2')}</span>
                </li>
              </ol>
              <div className="rounded-md border border-border p-3 text-sm">
                <p className="font-medium">{t('preview.offerTitle')}</p>
                <p className="type-meta">{t('preview.offerBody')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="type-h2 mb-10 max-w-2xl">
          {t('how.title')}
        </h2>
        <ol className="grid gap-6 md:grid-cols-3">
          {STEPS.map(({ key, icon: Icon }, index) => (
            <li key={key} className="bg-card shadow-card rounded-lg border border-border p-6">
              <span className="bg-primary/10 text-primary mb-4 grid size-10 place-items-center rounded-md">
                <Icon aria-hidden="true" className="size-5" />
              </span>
              <p className="type-meta">{t('how.step', { n: index + 1 })}</p>
              <h3 className="type-h3 mt-1">{t(`how.${key}.title`)}</h3>
              <p className="text-muted-foreground mt-2 text-sm leading-6">{t(`how.${key}.body`)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-muted/50 border-y border-border">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 md:grid-cols-2">
          <div id="founders" className="scroll-mt-24 space-y-4">
            <h2 className="type-h2 text-3xl md:text-4xl">{t('founders.title')}</h2>
            <p className="text-muted-foreground">{t('founders.body')}</p>
            <ul className="space-y-2 text-sm">
              {(['p1', 'p2', 'p3', 'p4'] as const).map((key) => (
                <li key={key} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {t(`founders.${key}`)}
                </li>
              ))}
            </ul>
            <Link href="/login" className={buttonVariants({ variant: 'outline' })}>
              {t('founders.cta')}
            </Link>
          </div>
          <div id="supporters" className="scroll-mt-24 space-y-4">
            <h2 className="type-h2 text-3xl md:text-4xl">{t('supporters.title')}</h2>
            <p className="text-muted-foreground">{t('supporters.body')}</p>
            <ul className="space-y-2 text-sm">
              {(['p1', 'p2', 'p3', 'p4'] as const).map((key) => (
                <li key={key} className="flex gap-2">
                  <span aria-hidden="true" className="text-primary">
                    ✓
                  </span>
                  {t(`supporters.${key}`)}
                </li>
              ))}
            </ul>
            <Link href="/discover" className={buttonVariants({ variant: 'outline' })}>
              {t('supporters.cta')}
            </Link>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6" aria-labelledby="trust">
        <h2 id="trust" className="type-h2 mb-3 max-w-2xl">
          {t('trust.title')}
        </h2>
        <p className="text-muted-foreground mb-10 max-w-2xl">{t('trust.body')}</p>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {TRUST.map(({ key, icon: Icon }) => (
            <div key={key} className="space-y-2">
              <Icon aria-hidden="true" className="text-primary size-5" />
              <h3 className="font-semibold">{t(`trust.${key}.title`)}</h3>
              <p className="text-muted-foreground text-sm leading-6">{t(`trust.${key}.body`)}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-16 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="type-h3 text-2xl">{t('cta.title')}</h2>
            <p className="text-muted-foreground mt-1">{t('cta.body')}</p>
          </div>
          <Link href="/login" className={buttonVariants({ size: 'lg' })}>
            {t('cta.button')}
          </Link>
        </div>
      </section>
    </main>
  );
}
