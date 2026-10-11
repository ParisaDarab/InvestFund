import { useTranslations } from 'next-intl';

import { moneyCompact, percentOf } from '@/lib/format';

export interface FundingProgressProps {
  reportedMinor: string;
  targetMinor: string | null;
  currency: string;
  compact?: boolean;
}

/**
 * Reported funding against the target. "Reported" is deliberate: the platform records what the
 * parties confirm; it never verifies a payment.
 */
export function FundingProgress({
  reportedMinor,
  targetMinor,
  currency,
  compact = false,
}: FundingProgressProps) {
  const t = useTranslations('startup.progress');
  const pct = percentOf(reportedMinor, targetMinor);
  return (
    <div className="space-y-1.5">
      <div
        className="bg-muted h-2 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        aria-label={t('label')}
      >
        <div
          className="bg-primary h-full rounded-full transition-[width]"
          style={{ width: `${String(pct)}%` }}
        />
      </div>
      <p className="type-meta tabular-nums">
        {t(compact ? 'compact' : 'full', {
          reported: moneyCompact(reportedMinor, currency),
          target: moneyCompact(targetMinor, currency),
          pct,
        })}
      </p>
    </div>
  );
}
