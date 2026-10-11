'use client';

import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Bookmark, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';

import { DiscoverView } from './discover-view';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { MatchScore } from '@/components/startup/match-score';
import { StartupCard } from '@/components/startup/startup-card';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

export function AppDiscover() {
  const t = useTranslations('discover');
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense fallback={<ListSkeleton />}>
        <DiscoverView initial={null} initialKey="" />
      </Suspense>
    </div>
  );
}

export function Recommended() {
  const t = useTranslations('recommended');
  const query = useInfiniteQuery({
    queryKey: keys.recommendations,
    queryFn: ({ pageParam }) => api.recommendations(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href="/app/profile" className={buttonVariants({ variant: 'outline' })}>
            {t('editPreferences')}
          </Link>
        }
      />
      {query.isPending ? (
        <ListSkeleton rows={4} />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Link href="/app/discover" className={buttonVariants()}>
              {t('browse')}
            </Link>
          }
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2" data-testid="recommendations">
            {items.map((item) => (
              <li key={item.startup.id}>
                <StartupCard
                  startup={item.startup}
                  extra={
                    <MatchScore
                      score={item.score}
                      factors={item.factors}
                      explanation={item.explanation}
                    />
                  }
                />
              </li>
            ))}
          </ul>
          {query.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => void query.fetchNextPage()}
                disabled={query.isFetchingNextPage}
              >
                {t('more')}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

export function Saved() {
  const t = useTranslations('saved');
  const query = useQuery({ queryKey: keys.saved, queryFn: api.saved });
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          icon={Bookmark}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Link href="/app/discover" className={buttonVariants()}>
              {t('browse')}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {query.data.data.map((s) => (
            <li key={s.id}>
              <StartupCard startup={s} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
