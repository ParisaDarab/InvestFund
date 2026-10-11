import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { Metadata } from 'next';

import { Onboarding } from '@/features/auth/onboarding';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('onboarding');
  return { title: t('metaTitle') };
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <Onboarding />
    </Suspense>
  );
}
