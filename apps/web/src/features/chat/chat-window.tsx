'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Handshake, Send, WifiOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { MAX_MESSAGE_LENGTH, type MessageView } from '@investfund/shared';

import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Textarea } from '@/components/ui/textarea';
import { BlockButton } from '@/features/moderation-actions';
import { ReportDialog } from '@/features/startups/report-dialog';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { dateOnly, timeOnly } from '@/lib/format';
import { addMessageToCache, useRealtimeStatus } from '@/lib/realtime/realtime';

interface Pending {
  clientMessageId: string;
  body: string;
  failed: boolean;
}

function MessageBubble({
  mine,
  body,
  time,
  status,
}: {
  mine: boolean;
  body: string;
  time: string;
  status?: 'sending' | 'failed';
}) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[80%] rounded-lg px-3.5 py-2 text-sm leading-6 break-words whitespace-pre-wrap',
          mine ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm',
          status === 'sending' && 'opacity-70',
          status === 'failed' && 'ring-destructive ring-2',
        )}
        data-testid="message"
      >
        {body}
        <span
          className={cn(
            'mt-0.5 block text-right text-[11px]',
            mine ? 'text-primary-foreground/80' : 'text-muted-foreground',
          )}
        >
          {time}
        </span>
      </div>
    </div>
  );
}

export function ChatWindow({ id }: { id: string }) {
  const t = useTranslations('chat');
  const user = useCurrentUser();
  const queryClient = useQueryClient();
  const realtime = useRealtimeStatus();
  const [draft, setDraft] = useState('');
  const [pending, setPending] = useState<Pending[]>([]);
  const bottom = useRef<HTMLDivElement>(null);

  const conversation = useQuery({
    queryKey: keys.conversation(id),
    queryFn: () => api.conversation(id),
  });
  const messages = useInfiniteQuery({
    queryKey: keys.messages(id),
    queryFn: ({ pageParam }) => api.messages(id, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const all: MessageView[] = (messages.data?.pages.flatMap((p) => p.data) ?? []).slice().reverse();
  const known = new Set(all.map((m) => m.clientMessageId));
  const visiblePending = pending.filter((p) => !known.has(p.clientMessageId));
  const newestId = all[all.length - 1]?.id;

  // Keep the read marker current while the conversation is open.
  useEffect(() => {
    if (newestId === undefined) return;
    void api
      .markRead(id)
      .then(() => {
        void queryClient.invalidateQueries({ queryKey: keys.conversations });
        void queryClient.invalidateQueries({ queryKey: keys.unread });
      })
      .catch(() => undefined);
  }, [id, newestId, queryClient]);
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [newestId, visiblePending.length]);

  const send = useMutation({
    mutationFn: (item: Pending) => api.sendMessage(id, item.clientMessageId, item.body),
    onSuccess: (message) => {
      addMessageToCache(queryClient, message);
      setPending((list) => list.filter((p) => p.clientMessageId !== message.clientMessageId));
      void queryClient.invalidateQueries({ queryKey: keys.conversations });
    },
    onError: (_error, item) => {
      setPending((list) =>
        list.map((p) => (p.clientMessageId === item.clientMessageId ? { ...p, failed: true } : p)),
      );
    },
  });
  const submit = () => {
    const body = draft.trim();
    if (body === '') return;
    const item = { clientMessageId: crypto.randomUUID(), body, failed: false };
    setPending((list) => [...list, item]);
    setDraft('');
    send.mutate(item);
  };

  if (conversation.isPending) return <ListSkeleton rows={4} />;
  if (conversation.isError)
    return <QueryError error={conversation.error} onRetry={() => void conversation.refetch()} />;
  const c = conversation.data;

  let lastDay = '';
  return (
    <section
      className="bg-card flex h-[calc(100dvh-12rem)] min-h-[28rem] flex-col rounded-lg border border-border"
      aria-label={t('windowLabel', { name: c.counterpart.displayName })}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3">
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{c.counterpart.displayName}</h2>
          <p className="type-meta truncate">{c.startup.name}</p>
        </div>
        {realtime === 'live' ? null : (
          <span className="text-warning flex items-center gap-1 text-xs" role="status">
            <WifiOff aria-hidden="true" className="size-3.5" />
            {t(`realtime.${realtime}`)}
          </span>
        )}
        <Link
          href={`/app/deals?connectionId=${c.connectionId}`}
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
          data-testid="chat-deals"
        >
          <Handshake aria-hidden="true" />
          {t('funding')}
        </Link>
        <BlockButton
          userId={c.counterpart.id}
          name={c.counterpart.displayName}
          blocked={c.readOnly}
        />
        <ReportDialog targetType="user" targetId={c.counterpart.id} />
      </header>

      <div
        className="flex-1 space-y-2 overflow-y-auto px-4 py-4"
        aria-live="polite"
        aria-relevant="additions"
        data-testid="message-list"
      >
        {messages.hasNextPage ? (
          <div className="flex justify-center">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void messages.fetchNextPage()}
              disabled={messages.isFetchingNextPage}
            >
              {t('earlier')}
            </Button>
          </div>
        ) : null}
        {messages.isPending ? <ListSkeleton rows={2} /> : null}
        {messages.isError ? (
          <QueryError error={messages.error} onRetry={() => void messages.refetch()} />
        ) : null}
        {messages.isSuccess && all.length === 0 && visiblePending.length === 0 ? (
          <p className="type-meta py-10 text-center">
            {t('start', { name: c.counterpart.displayName })}
          </p>
        ) : null}
        {all.map((m) => {
          const day = dateOnly(m.createdAt.slice(0, 10));
          const separator = day !== lastDay;
          lastDay = day;
          return (
            <div key={m.id}>
              {separator ? <p className="type-meta py-2 text-center text-xs">{day}</p> : null}
              <MessageBubble
                mine={m.senderId === user.id}
                body={m.body}
                time={timeOnly(m.createdAt)}
              />
            </div>
          );
        })}
        {visiblePending.map((p) => (
          <div key={p.clientMessageId} className="space-y-1">
            <MessageBubble
              mine
              body={p.body}
              time={p.failed ? t('failed') : t('sending')}
              status={p.failed ? 'failed' : 'sending'}
            />
            {p.failed ? (
              <div className="flex justify-end gap-2 text-xs">
                <span className="text-destructive flex items-center gap-1">
                  <AlertCircle aria-hidden="true" className="size-3.5" />
                  {t('notSent')}
                </span>
                <button
                  type="button"
                  className="text-primary font-medium"
                  onClick={() => {
                    setPending((list) =>
                      list.map((x) =>
                        x.clientMessageId === p.clientMessageId ? { ...x, failed: false } : x,
                      ),
                    );
                    send.mutate({ ...p, failed: false });
                  }}
                >
                  {t('retry')}
                </button>
              </div>
            ) : null}
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {c.readOnly ? (
        <p className="type-meta border-t border-border px-4 py-3" role="status">
          {t('readOnly')}
        </p>
      ) : (
        <form
          className="flex items-end gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="chat-input" className="sr-only">
            {t('inputLabel')}
          </label>
          <Textarea
            id="chat-input"
            rows={1}
            value={draft}
            maxLength={MAX_MESSAGE_LENGTH}
            placeholder={t('placeholder')}
            className="max-h-40 min-h-10 resize-none py-2"
            data-testid="chat-input"
            onChange={(e) => {
              setDraft(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <Button
            type="submit"
            size="icon"
            aria-label={t('send')}
            disabled={draft.trim() === ''}
            data-testid="chat-send"
          >
            <Send aria-hidden="true" />
          </Button>
        </form>
      )}
    </section>
  );
}
