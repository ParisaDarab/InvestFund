import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('home');
  return { title: t('metaTitle') };
}

// Placeholder landing page. The marketing shell (nav, hero, footer) arrives in P0-WEB-03.
export default function HomePage() {
  const t = useTranslations('home');

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-center gap-6 p-6"
      data-testid="home"
    >
      <h1 className="text-5xl font-bold tracking-tight md:text-7xl">{t('title')}</h1>
      <p className="text-lg">{t('description')}</p>
      <Link
        href="/login"
        className="font-medium underline underline-offset-4"
        data-testid="home-sign-in"
      >
        {t('signIn')}
      </Link>
    </main>
  );
}
