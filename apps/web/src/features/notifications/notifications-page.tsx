'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { NotificationView } from '@investfund/shared';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';

export function NotificationsPage() {
  const t = useTranslations('notifications');
  const queryClient = useQueryClient();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useInfiniteQuery({
    queryKey: [...keys.notifications, { unreadOnly }],
    queryFn: ({ pageParam }) =>
      api.notifications({
        unreadOnly: unreadOnly ? 'true' : undefined,
        cursor: pageParam,
        limit: 20,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: keys.notifications });
    await queryClient.invalidateQueries({ queryKey: keys.unread });
  };
  const markAll = useMutation({
    mutationFn: () => api.markNotificationsRead({ all: true }),
    onSuccess: refresh,
  });
  const markOne = useMutation({
    mutationFn: (id: string) => api.markNotificationsRead({ ids: [id] }),
    onSuccess: refresh,
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  const text = (n: NotificationView) =>
    t(`types.${n.type}`, { startup: n.data.startupName ?? '', name: n.data.actorName ?? '' });

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Button
            variant="outline"
            disabled={unreadCount === 0 || markAll.isPending}
            onClick={() => {
              markAll.mutate();
            }}
            data-testid="mark-all-read"
          >
            {t('markAll')}
          </Button>
        }
      />
      <Tabs
        value={unreadOnly ? 'unread' : 'all'}
        onValueChange={(v) => {
          setUnreadOnly(v === 'unread');
        }}
      >
        <TabsList>
          <TabsTrigger value="all">{t('all')}</TabsTrigger>
          <TabsTrigger value="unread">{t('unread', { count: unreadCount })}</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Bell} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((n) => (
            <li
              key={n.id}
              className={cn('flex items-start gap-3 p-4', n.readAt === null && 'bg-primary/5')}
              data-testid="notification"
            >
              <span
                aria-hidden="true"
                className={cn(
                  'mt-2 size-2 shrink-0 rounded-full',
                  n.readAt === null ? 'bg-primary' : 'bg-transparent',
                )}
              />
              <div className="min-w-0 flex-1">
                <Link
                  href={n.link}
                  className="font-medium hover:underline"
                  onClick={() => {
                    if (n.readAt === null) markOne.mutate(n.id);
                  }}
                >
                  {text(n)}
                </Link>
                <p className="type-meta">{relativeTime(n.createdAt)}</p>
              </div>
              {n.readAt === null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    markOne.mutate(n.id);
                  }}
                >
                  {t('markRead')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {query.hasNextPage ? (
        <Button variant="outline" onClick={() => void query.fetchNextPage()}>
          {t('more')}
        </Button>
      ) : null}
    </div>
  );
}
