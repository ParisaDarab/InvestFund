'use client';

import { useQuery } from '@tanstack/react-query';
import { MessagesSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { EmptyState } from '@/components/common/empty-state';
import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { relativeTime } from '@/lib/format';

export function ConversationList({ activeId }: { activeId?: string }) {
  const t = useTranslations('chat');
  const user = useCurrentUser();
  const query = useQuery({ queryKey: keys.conversations, queryFn: api.conversations });
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.data.length === 0) {
    return (
      <EmptyState icon={MessagesSquare} title={t('emptyTitle')} description={t('emptyBody')} />
    );
  }
  return (
    <ul className="grid gap-1" aria-label={t('listLabel')}>
      {query.data.data.map((c) => {
        const active = c.id === activeId;
        return (
          <li key={c.id}>
            <Link
              href={`/app/messages/${c.id}`}
              aria-current={active ? 'page' : undefined}
              data-testid="conversation-item"
              className={cn(
                'flex flex-col gap-0.5 rounded-md px-3 py-2.5 transition-colors',
                active ? 'bg-primary/10' : 'hover:bg-muted',
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    'truncate text-sm',
                    c.unreadCount > 0 ? 'font-semibold' : 'font-medium',
                  )}
                >
                  {c.counterpart.displayName}
                </span>
                {c.unreadCount > 0 ? (
                  <span
                    className="bg-primary text-primary-foreground rounded-full px-1.5 text-xs font-semibold"
                    aria-label={t('unread', { count: c.unreadCount })}
                  >
                    {c.unreadCount}
                  </span>
                ) : null}
              </span>
              <span className="type-meta truncate">{c.startup.name}</span>
              <span className="text-muted-foreground truncate text-xs">
                {c.lastMessage === null
                  ? t('noMessages')
                  : `${c.lastMessage.senderId === user.id ? t('you') : ''}${c.lastMessage.preview} · ${relativeTime(c.lastMessage.createdAt)}`}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
