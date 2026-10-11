'use client';

import { AlertTriangle } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { isApiError } from '@/lib/api/client';
import { cn } from '@/lib/cn';

/** Placeholder rows while a list loads. */
export function ListSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  const t = useTranslations('common');
  return (
    <div className={cn('space-y-3', className)} role="status" aria-label={t('loading')}>
      {Array.from({ length: rows }, (_, index) => (
        <Skeleton key={index} className="h-24 w-full" />
      ))}
    </div>
  );
}

/** A failed query with a retry button. Shows a specific message for offline and forbidden. */
export function QueryError({
  error,
  onRetry,
  className,
}: {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}) {
  const t = useTranslations('common.errors');
  const message = !isApiError(error)
    ? t('generic')
    : error.kind === 'network'
      ? t('network')
      : error.status === 404
        ? t('notFound')
        : error.status === 403
          ? t('forbidden')
          : error.status === 429
            ? t('rateLimited')
            : t('generic');
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-start gap-3 rounded-lg border border-destructive/40 p-4',
        className,
      )}
      data-testid="query-error"
    >
      <p className="text-destructive flex items-center gap-2 text-sm font-medium">
        <AlertTriangle aria-hidden="true" className="size-4" />
        {message}
      </p>
      {onRetry === undefined ? null : (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {t('retry')}
        </Button>
      )}
    </div>
  );
}

/** The human-readable message of a failed mutation (problem `detail`, else a generic one). */
export function useErrorMessage(): (error: unknown) => string {
  const t = useTranslations('common.errors');
  return (error) => {
    if (!isApiError(error)) return t('generic');
    if (error.kind === 'network') return t('network');
    if (error.status === 429) return t('rateLimited');
    return error.problem?.detail ?? error.problem?.title ?? t('generic');
  };
}
