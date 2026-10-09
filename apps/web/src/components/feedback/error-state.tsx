'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

export interface ErrorStateProps {
  error: Error & { digest?: string };
  retry: () => void;
}

/** Shared fallback for the `error.tsx` boundary of every route group. */
export function ErrorState({ error, retry }: ErrorStateProps) {
  const t = useTranslations('errors.generic');

  useEffect(() => {
    // Only the digest is logged: error messages may contain user data.
    if (error.digest !== undefined) console.error('Route error', { digest: error.digest });
  }, [error]);

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 p-6"
      data-testid="error-state"
    >
      <h1 className="type-h1">{t('title')}</h1>
      <p className="type-body text-muted-foreground">{t('description')}</p>
      <Button variant="outline" onClick={retry} data-testid="error-retry">
        {t('retry')}
      </Button>
    </main>
  );
}
