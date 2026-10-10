import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('metaTitle') };
}

// Placeholder app home. The role-aware app shell and route guards arrive in Phase 1.
export default function AppHomePage() {
  const t = useTranslations('app');

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-5xl flex-col justify-center gap-4 p-6"
      data-testid="app-home"
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p>{t('description')}</p>
    </main>
  );
}
