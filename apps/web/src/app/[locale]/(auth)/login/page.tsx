import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { Metadata } from 'next';

import { LoginPanel } from '@/features/auth/login-panel';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('login');
  return { title: t('metaTitle') };
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginPanel />
    </Suspense>
  );
}
