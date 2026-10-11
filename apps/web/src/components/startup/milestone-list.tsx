import { Flag } from 'lucide-react';
import { useTranslations } from 'next-intl';

import type { Milestone } from '@investfund/shared';

import { dateOnly, moneyCompact as money } from '@/lib/format';

export function MilestoneList({ milestones }: { milestones: readonly Milestone[] }) {
  const t = useTranslations('startup.milestones');
  return (
    <ol className="relative space-y-4 border-l border-border pl-6" data-testid="milestone-list">
      {milestones.map((milestone, index) => (
        <li key={milestone.id} className="relative">
          <span className="bg-card text-primary absolute top-0.5 -left-[33px] grid size-5 place-items-center rounded-full border border-border">
            <Flag aria-hidden="true" className="size-3" />
          </span>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="font-medium">{t('item', { n: index + 1, title: milestone.title })}</p>
            <p className="font-semibold tabular-nums">
              {money(milestone.targetAmountMinor, milestone.currency)}
            </p>
          </div>
          <p className="text-muted-foreground mt-1 text-sm whitespace-pre-line">
            {milestone.description}
          </p>
          {milestone.targetDate === null ? null : (
            <p className="type-meta mt-1">
              {t('targetDate', { date: dateOnly(milestone.targetDate) })}
            </p>
          )}
        </li>
      ))}
    </ol>
  );
}
