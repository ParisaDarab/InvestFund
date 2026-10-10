import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import type { Metadata } from 'next';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('errors.notFound');
  return { title: t('metaTitle') };
}

// Any unknown path below a locale (e.g. /en-GB/does-not-exist) renders the localised 404 page
// (`../not-found.tsx`) with HTTP status 404.
export default function CatchAllPage() {
  notFound();
}
