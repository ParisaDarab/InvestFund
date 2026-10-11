import { CalendarClock, ExternalLink, MapPin } from 'lucide-react';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { StartupDetail } from '@investfund/shared';

import type { Metadata } from 'next';

import { FundingProgress } from '@/components/startup/funding-progress';
import { MilestoneList } from '@/components/startup/milestone-list';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { StartupActions } from '@/features/startups/startup-actions';
import { Link } from '@/i18n/navigation';
import { isApiError } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';
import { dateOnly, moneyCompact as money } from '@/lib/format';

interface StartupPageProps {
  params: Promise<{ slug: string }>;
}

async function load(slug: string): Promise<StartupDetail> {
  try {
    return await api.startupBySlug(slug);
  } catch (error) {
    if (isApiError(error) && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  }
}

export async function generateMetadata({ params }: StartupPageProps): Promise<Metadata> {
  const { slug } = await params;
  try {
    const startup = await api.startupBySlug(slug);
    return { title: startup.name, description: startup.tagline ?? undefined };
  } catch {
    return {};
  }
}

export default async function StartupPage({ params }: StartupPageProps) {
  const { slug } = await params;
  const startup = await load(slug);
  const t = await getTranslations('startupPage');
  const tx = await getTranslations('taxonomy');
  const sections = [
    ['about', startup.description],
    ['problem', startup.problem],
    ['solution', startup.solution],
    ['product', startup.productDescription],
    ['businessModel', startup.businessModel],
    ['team', startup.teamDescription],
    ['targetMarket', startup.targetMarket],
  ] as const;

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6" data-testid="startup-page">
      <Link href="/discover" className="type-meta hover:text-foreground">
        {t('back')}
      </Link>
      <div className="mt-4 grid gap-10 lg:grid-cols-[1fr_20rem]">
        <article className="min-w-0 space-y-8">
          <header className="space-y-3">
            <h1 className="type-h1 text-4xl">{startup.name}</h1>
            {startup.tagline === null ? null : (
              <p className="text-muted-foreground text-lg">{startup.tagline}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {startup.sector === null ? null : <Badge>{tx(`sector.${startup.sector}`)}</Badge>}
              {startup.stage === null ? null : (
                <Badge variant="outline">{tx(`stage.${startup.stage}`)}</Badge>
              )}
              {startup.country === null ? null : (
                <Badge variant="outline">
                  <MapPin aria-hidden="true" className="size-3" />
                  {tx(`country.${startup.country}` as 'country.GB')}
                </Badge>
              )}
            </div>
            <p className="type-meta">
              {t('founder', { name: startup.founder.displayName })}
              {startup.founderHeadline === null ? null : ` · ${startup.founderHeadline}`}
            </p>
          </header>

          <Card className="shadow-card grid gap-6 p-6 sm:grid-cols-3">
            <div>
              <p className="type-meta">{t('target')}</p>
              <p className="text-2xl font-semibold tabular-nums" data-testid="startup-target">
                {money(startup.targetAmountMinor, startup.currency)}
              </p>
            </div>
            <div>
              <p className="type-meta">{t('range')}</p>
              <p className="font-medium tabular-nums">
                {t('rangeValue', {
                  min: money(startup.minAmountMinor, startup.currency),
                  max: money(startup.maxAmountMinor, startup.currency),
                })}
              </p>
            </div>
            <div>
              <p className="type-meta">{t('deadline')}</p>
              <p className="flex items-center gap-1.5 font-medium">
                <CalendarClock aria-hidden="true" className="size-4" />
                {startup.fundingDeadline === null
                  ? t('noDeadline')
                  : dateOnly(startup.fundingDeadline)}
              </p>
            </div>
            <div className="sm:col-span-3">
              <FundingProgress
                reportedMinor={startup.reportedFundingMinor}
                targetMinor={startup.targetAmountMinor}
                currency={startup.currency}
              />
            </div>
          </Card>

          <section aria-labelledby="purpose" className="space-y-3">
            <h2 id="purpose" className="type-h3">
              {t('purpose')}
            </h2>
            <div className="flex flex-wrap gap-2">
              {startup.fundingPurposes.map((purpose) => (
                <Badge key={purpose} variant="primary">
                  {tx(`purpose.${purpose}`)}
                </Badge>
              ))}
            </div>
            {startup.fundingPurposeText === null ? null : (
              <p className="leading-7 whitespace-pre-line">{startup.fundingPurposeText}</p>
            )}
          </section>

          <section aria-labelledby="milestones" className="space-y-4">
            <h2 id="milestones" className="type-h3">
              {t('milestones')}
            </h2>
            <MilestoneList milestones={startup.milestones} />
          </section>

          {sections.map(([key, value]) =>
            value === null ? null : (
              <section key={key} aria-labelledby={`s-${key}`} className="space-y-2">
                <h2 id={`s-${key}`} className="type-h3">
                  {t(`sections.${key}`)}
                </h2>
                <p className="leading-7 whitespace-pre-line">{value}</p>
              </section>
            ),
          )}
          {startup.websiteUrl === null ? null : (
            <a
              href={startup.websiteUrl}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-primary inline-flex items-center gap-1.5 font-medium"
            >
              {t('website')}
              <ExternalLink aria-hidden="true" className="size-4" />
            </a>
          )}
        </article>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <StartupActions startup={startup} />
        </aside>
      </div>
    </main>
  );
}
