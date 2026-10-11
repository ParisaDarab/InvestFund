import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

import { Dashboard } from '@/features/dashboard/dashboard';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('app');
  return { title: t('metaTitle') };
}

export default function DashboardPage() {
  return <Dashboard />;
}
