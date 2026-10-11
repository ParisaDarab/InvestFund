'use client';

import { useTranslations } from 'next-intl';

import type { MatchFactorScore } from '@investfund/shared';

/** Score ring plus the factor breakdown and reasons (all from the server; nothing invented). */
export function MatchScore({
  score,
  factors,
  explanation,
}: {
  score: number;
  factors: readonly MatchFactorScore[];
  explanation: string;
}) {
  const t = useTranslations('match');
  return (
    <div className="space-y-3" data-testid="match-score">
      <div className="flex items-center gap-3">
        <span
          className="border-primary text-primary grid size-12 shrink-0 place-items-center rounded-full border-2 text-sm font-bold tabular-nums"
          aria-label={t('scoreLabel', { score })}
        >
          {score}
        </span>
        <p className="text-sm">{explanation}</p>
      </div>
      <details className="group text-sm">
        <summary className="text-primary cursor-pointer font-medium">{t('breakdown')}</summary>
        <ul className="mt-2 space-y-2">
          {factors.map((factor) => (
            <li key={factor.factor} className="grid grid-cols-[8rem_1fr_auto] items-center gap-2">
              <span className="text-muted-foreground">{t(`factor.${factor.factor}`)}</span>
              <span className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden="true">
                <span
                  className="bg-primary block h-full"
                  style={{ width: `${String(factor.score)}%` }}
                />
              </span>
              <span className="type-meta tabular-nums">
                {t('weighted', { score: factor.score, weight: factor.weight })}
              </span>
              <span className="type-meta col-span-3 -mt-1">
                {t(`reason.${factor.reason}` as 'reason.sector_match')}
              </span>
            </li>
          ))}
        </ul>
        <p className="type-meta mt-2">{t('disclaimer')}</p>
      </details>
    </div>
  );
}
