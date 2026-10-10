import { useTranslations } from 'next-intl';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

import { Link } from '@/i18n/navigation';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('metaTitle') };
}

// Placeholder sign-in page. Authentication arrives in Phase 1.
export default function LoginPage() {
  const t = useTranslations('login');

  return (
    <main
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 p-6"
      data-testid="login"
    >
      <h1 className="text-3xl font-semibold tracking-tight">{t('title')}</h1>
      <p>{t('description')}</p>
      <Link href="/" className="font-medium underline underline-offset-4">
        {t('backHome')}
      </Link>
    </main>
  );
}
