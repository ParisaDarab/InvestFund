import { getTranslations } from 'next-intl/server';
import { Suspense } from 'react';

import type { StartupPage } from '@investfund/shared';

import type { Metadata } from 'next';

import { ListSkeleton } from '@/components/common/query-states';
import { DiscoverView } from '@/features/discovery/discover-view';
import {
  filtersFromParams,
  filtersToApiQuery,
  filtersToParams,
} from '@/features/discovery/search-params';
import { api } from '@/lib/api/endpoints';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('discover');
  return { title: t('metaTitle'), description: t('description') };
}

interface DiscoverPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Public discovery: the first page is rendered on the server; filtering and paging on the client. */
export default async function DiscoverPage({ searchParams }: DiscoverPageProps) {
  const t = await getTranslations('discover');
  const filters = filtersFromParams(await searchParams);
  let initial: StartupPage | null = null;
  try {
    initial = await api.searchStartups(filtersToApiQuery(filters));
  } catch {
    // The client retries and shows an error state with a retry button.
    initial = null;
  }
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <div className="mb-8 max-w-2xl space-y-2">
        <h1 className="type-h1">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      <Suspense fallback={<ListSkeleton rows={4} />}>
        <DiscoverView initial={initial} initialKey={filtersToParams(filters).toString()} />
      </Suspense>
    </main>
  );
}
