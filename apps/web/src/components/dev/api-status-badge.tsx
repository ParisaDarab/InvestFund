'use client';

import { useTranslations } from 'next-intl';

import type { HealthReport } from '@investfund/shared';

import type { StatusTone } from '@/components/ui/badge';

import { StatusPill } from '@/components/ui/badge';
import { isApiError } from '@/lib/api/client';
import { useHealth } from '@/lib/api/health';

export type ApiStatus = 'checking' | 'ready' | 'notReady' | 'unreachable' | 'error';

/** Badge state for a `useHealth()` result. */
export function apiStatusOf(query: { data: HealthReport | undefined; error: unknown }): ApiStatus {
  if (query.data !== undefined) return query.data.status === 'ok' ? 'ready' : 'notReady';
  if (query.error === null || query.error === undefined) return 'checking';
  return isApiError(query.error) && query.error.kind === 'network' ? 'unreachable' : 'error';
}

const toneByStatus: Record<ApiStatus, StatusTone> = {
  checking: 'neutral',
  ready: 'success',
  notReady: 'warning',
  unreachable: 'danger',
  error: 'danger',
};

export interface ApiStatusBadgeProps {
  /** Host of the API being checked, shown next to the status. */
  apiHost: string;
}

/**
 * Developer aid: API readiness from `GET /health/ready`. The status is spelled out (the colour
 * only repeats it) and announced politely when it changes. Rendered by `DevApiStatus`, which
 * leaves it out of production builds.
 */
export function ApiStatusBadge({ apiHost }: ApiStatusBadgeProps) {
  const t = useTranslations('devApiStatus');
  const { data, error } = useHealth();
  const status = apiStatusOf({ data, error });

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-4 bottom-4 z-40 flex items-center gap-2 rounded-full border border-border bg-background px-2 py-1 shadow-sm"
      data-testid="api-status-badge"
      data-state={status}
    >
      <StatusPill tone={toneByStatus[status]} className="!border-transparent">
        {t(status)}
      </StatusPill>
      <span className="pr-1 text-xs text-muted-foreground">{t('host', { host: apiHost })}</span>
    </div>
  );
}
