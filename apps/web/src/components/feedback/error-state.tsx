'use client';

import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

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
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p>{t('description')}</p>
      <button
        type="button"
        onClick={retry}
        className="rounded-md border px-4 py-2 font-medium focus-visible:ring-2 focus-visible:outline-none"
        data-testid="error-retry"
      >
        {t('retry')}
      </button>
    </main>
  );
}
