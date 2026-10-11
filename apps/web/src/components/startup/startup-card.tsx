'use client';

import { MapPin } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { StartupSummary } from '@investfund/shared';

import { FundingProgress } from './funding-progress';

import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Link } from '@/i18n/navigation';
import { moneyCompact } from '@/lib/format';

export interface StartupCardProps {
  startup: StartupSummary;
  /** Extra content under the summary (match score, saved toggle...). */
  footer?: ReactNode;
  /** A section below the card body (recommendation explanation). */
  extra?: ReactNode;
}

export function StartupCard({ startup, footer, extra }: StartupCardProps) {
  const t = useTranslations('taxonomy');
  const tc = useTranslations('startup.card');
  return (
    <Card
      className="shadow-card flex h-full flex-col gap-4 p-5 transition-shadow hover:shadow-raised"
      data-testid="startup-card"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="truncate text-lg font-semibold">
            <Link
              href={`/startups/${startup.slug}`}
              className="hover:text-primary focus-visible:underline"
            >
              {startup.name}
            </Link>
          </h3>
          <p className="text-muted-foreground line-clamp-2 text-sm">{startup.tagline}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {startup.sector === null ? null : <Badge>{t(`sector.${startup.sector}`)}</Badge>}
        {startup.stage === null ? null : (
          <Badge variant="outline">{t(`stage.${startup.stage}`)}</Badge>
        )}
        {startup.country === null ? null : (
          <Badge variant="outline">
            <MapPin aria-hidden="true" className="size-3" />
            {t(`country.${startup.country}` as 'country.GB')}
          </Badge>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <dt className="type-meta">{tc('target')}</dt>
          <dd className="font-semibold tabular-nums">
            {moneyCompact(startup.targetAmountMinor, startup.currency)}
          </dd>
        </div>
        <div>
          <dt className="type-meta">{tc('range')}</dt>
          <dd className="font-medium tabular-nums">
            {moneyCompact(startup.minAmountMinor, startup.currency)}–
            {moneyCompact(startup.maxAmountMinor, startup.currency)}
          </dd>
        </div>
      </dl>
      <FundingProgress
        compact
        reportedMinor={startup.reportedFundingMinor}
        targetMinor={startup.targetAmountMinor}
        currency={startup.currency}
      />
      <div className="mt-auto flex items-center justify-between gap-2 pt-1">
        <p className="type-meta truncate">{tc('by', { name: startup.founder.displayName })}</p>
        {footer}
      </div>
      {extra === undefined ? null : <div className="border-t border-border pt-4">{extra}</div>}
    </Card>
  );
}
