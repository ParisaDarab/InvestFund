import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

import { ProsePage, ProseSection } from '@/components/common/prose-page';

const SECTIONS = ['s1', 's2', 's3', 's4', 's5'] as const;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('info.privacy');
  return { title: t('title') };
}

export default async function Page() {
  const t = await getTranslations('info.privacy');
  return (
    <ProsePage title={t('title')} intro={t('intro')} notice={t('notice')}>
      {SECTIONS.map((key) => (
        <ProseSection key={key} title={t(`${key}.title`)} body={t(`${key}.body`)} />
      ))}
    </ProsePage>
  );
}
