'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { ConnectionAction, ConnectionView } from '@investfund/shared';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BlockButton } from '@/features/moderation-actions';
import { ReportDialog } from '@/features/startups/report-dialog';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser } from '@/lib/auth/session';
import { relativeTime } from '@/lib/format';

function ConnectionRow({ connection }: { connection: ConnectionView }) {
  const t = useTranslations('connections');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const act = useMutation({
    mutationFn: (action: ConnectionAction) => api.actOnConnection(connection.id, action),
    onSuccess: async (_, action) => {
      toast({ title: t(`done.${action}`) });
      await queryClient.invalidateQueries({ queryKey: keys.connectionsAll });
      await queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  const isFounderSide = connection.viewerRole === 'recipient';
  const counterpart = isFounderSide ? connection.supporter : connection.founder;
  return (
    <Card className="grid gap-3 p-5" data-testid="connection-row" data-status={connection.status}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="font-semibold">
            {isFounderSide
              ? t('incomingTitle', { name: counterpart.displayName })
              : t('outgoingTitle', { startup: connection.startup.name })}
          </p>
          <p className="type-meta">
            <Link
              href={`/startups/${connection.startup.slug}`}
              className="hover:text-foreground underline-offset-2 hover:underline"
            >
              {connection.startup.name}
            </Link>
            {' · '}
            {relativeTime(connection.createdAt)}
          </p>
        </div>
        <StatusLabel kind="connection" status={connection.status} />
      </div>
      {isFounderSide && connection.supporter.bio !== null ? (
        <p className="text-muted-foreground text-sm">{connection.supporter.bio}</p>
      ) : null}
      {connection.message === null ? null : (
        <blockquote className="border-primary/40 border-l-2 pl-3 text-sm whitespace-pre-line">
          {connection.message}
        </blockquote>
      )}
      {connection.blocked ? <p className="text-warning text-sm">{t('blockedNotice')}</p> : null}
      <div className="flex flex-wrap items-center gap-2">
        {connection.availableActions.includes('accept') ? (
          <Button
            size="sm"
            onClick={() => {
              act.mutate('accept');
            }}
            disabled={act.isPending}
            data-testid="accept-connection"
          >
            {t('accept')}
          </Button>
        ) : null}
        {connection.availableActions.includes('decline') ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              act.mutate('decline');
            }}
            disabled={act.isPending}
          >
            {t('decline')}
          </Button>
        ) : null}
        {connection.availableActions.includes('withdraw') ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              act.mutate('withdraw');
            }}
            disabled={act.isPending}
          >
            {t('withdraw')}
          </Button>
        ) : null}
        {connection.conversationId === null ? null : (
          <Link
            href={`/app/messages/${connection.conversationId}`}
            className={buttonVariants({ size: 'sm', variant: 'secondary' })}
          >
            {t('openChat')}
          </Link>
        )}
        {connection.status === 'accepted' ? (
          <Link
            href={`/app/deals?connectionId=${connection.id}`}
            className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          >
            {t('deals')}
          </Link>
        ) : null}
        <div className="ml-auto flex gap-1">
          <BlockButton
            userId={counterpart.id}
            name={counterpart.displayName}
            blocked={connection.blocked}
          />
          <ReportDialog targetType="user" targetId={counterpart.id} />
        </div>
      </div>
      {connection.status === 'accepted' ? <p className="type-meta">{t('notCommitment')}</p> : null}
    </Card>
  );
}

export function ConnectionsPage() {
  const t = useTranslations('connections');
  const user = useCurrentUser();
  const [direction, setDirection] = useState<'all' | 'incoming' | 'outgoing'>(
    user.role === 'founder' ? 'incoming' : 'outgoing',
  );
  const query = useInfiniteQuery({
    queryKey: keys.connections({ direction }),
    queryFn: ({ pageParam }) => api.connections({ direction, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t(user.role === 'founder' ? 'descriptionFounder' : 'descriptionSupporter')}
      />
      <Tabs
        value={direction}
        onValueChange={(v) => {
          setDirection(v as 'all');
        }}
      >
        <TabsList>
          {user.role === 'founder' ? (
            <TabsTrigger value="incoming">{t('tabs.incoming')}</TabsTrigger>
          ) : (
            <TabsTrigger value="outgoing">{t('tabs.outgoing')}</TabsTrigger>
          )}
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t('emptyTitle')}
          description={t(user.role === 'founder' ? 'emptyFounder' : 'emptySupporter')}
          action={
            user.role === 'supporter' ? (
              <Link href="/app/discover" className={buttonVariants()}>
                {t('discover')}
              </Link>
            ) : undefined
          }
        />
      ) : (
        <ul className="grid gap-4">
          {items.map((c) => (
            <li key={c.id}>
              <ConnectionRow connection={c} />
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
