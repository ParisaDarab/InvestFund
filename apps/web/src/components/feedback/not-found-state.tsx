'use client';

import { useTranslations } from 'next-intl';

import { Link } from '@/i18n/navigation';

/**
 * Shared localised 404 content for every `not-found.tsx`. A Client Component on purpose: Next.js
 * renders not-found boundaries without route params, so server-side next-intl APIs would fall back
 * to reading request headers and opt every page out of static rendering. On the client the locale
 * and messages come from the layout's NextIntlClientProvider.
 */
export function NotFoundState() {
  const t = useTranslations('errors.notFound');

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-xl flex-col items-start justify-center gap-4 p-6"
      data-testid="not-found"
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p>{t('description')}</p>
      <Link href="/" className="font-medium underline underline-offset-4">
        {t('homeLink')}
      </Link>
    </main>
  );
}
