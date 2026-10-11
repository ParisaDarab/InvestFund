'use client';

import { useTranslations } from 'next-intl';

import type { OfferView } from '@investfund/shared';

import { StatusLabel } from '@/components/common/status-label';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { dateTime, money } from '@/lib/format';

export function OfferCard({
  offer,
  authorName,
  highlight = false,
}: {
  offer: OfferView;
  authorName: string;
  highlight?: boolean;
}) {
  const t = useTranslations('deals.offer');
  const tx = useTranslations('taxonomy');
  return (
    <Card
      className={cn('grid gap-3 p-5', highlight && 'border-primary shadow-raised')}
      data-testid="offer-card"
      data-status={offer.status}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="type-meta">
            {t('revision', {
              n: offer.revision,
              name: authorName,
              date: dateTime(offer.createdAt),
            })}
          </p>
          <p className="text-2xl font-semibold tabular-nums" data-testid="offer-amount-display">
            {money(offer.amountMinor, offer.currency)}
          </p>
          <p className="text-sm font-medium">{tx(`fundingType.${offer.fundingType}`)}</p>
        </div>
        <StatusLabel kind="offer" status={offer.status} />
      </div>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="type-meta">{t('purpose')}</dt>
          <dd className="whitespace-pre-line">{offer.purpose}</dd>
        </div>
        {offer.conditions === null ? null : (
          <div>
            <dt className="type-meta">{t('conditions')}</dt>
            <dd className="whitespace-pre-line">{offer.conditions}</dd>
          </div>
        )}
        {offer.milestones.length === 0 ? null : (
          <div>
            <dt className="type-meta">{t('milestones')}</dt>
            <dd>{offer.milestones.map((m) => m.title).join(', ')}</dd>
          </div>
        )}
        {offer.respondBy === null ? null : (
          <div>
            <dt className="type-meta">{t('respondBy')}</dt>
            <dd>{dateTime(offer.respondBy)}</dd>
          </div>
        )}
        {offer.message === null ? null : (
          <div>
            <dt className="type-meta">{t('message')}</dt>
            <dd className="whitespace-pre-line">{offer.message}</dd>
          </div>
        )}
      </dl>
    </Card>
  );
}
