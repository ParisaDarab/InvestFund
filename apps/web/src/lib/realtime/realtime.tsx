'use client';

/**
 * Real-time client. One authenticated SSE stream per tab, read with `fetch` so the access token
 * goes in the `Authorization` header (never the URL). Events are hints: they update or invalidate
 * TanStack Query caches, and every (re)connection triggers a resync, so a dropped connection never
 * loses data. Reconnects with exponential backoff.
 */
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useState } from 'react';

import { MessageView, type MessagePage } from '@investfund/shared';

import type { ReactNode } from 'react';

import { buildApiUrl } from '@/lib/api/client';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';

export type RealtimeStatus = 'connecting' | 'live' | 'reconnecting' | 'offline';

const RealtimeContext = createContext<RealtimeStatus>('connecting');

export function useRealtimeStatus(): RealtimeStatus {
  return use(RealtimeContext);
}

/** Adds a message to the newest page of a conversation's cache (no duplicates). */
export function addMessageToCache(queryClient: QueryClient, message: MessageView): void {
  queryClient.setQueryData<InfiniteData<MessagePage>>(
    keys.messages(message.conversationId),
    (data) => {
      if (data === undefined) return data;
      if (
        data.pages.some((page) =>
          page.data.some(
            (m) => m.id === message.id || m.clientMessageId === message.clientMessageId,
          ),
        )
      ) {
        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            data: page.data.map((m) =>
              m.clientMessageId === message.clientMessageId ? message : m,
            ),
          })),
        };
      }
      const [first, ...rest] = data.pages;
      if (first === undefined) return data;
      return { ...data, pages: [{ ...first, data: [message, ...first.data] }, ...rest] };
    },
  );
}

function handleEvent(queryClient: QueryClient, event: string, data: Record<string, unknown>): void {
  const invalidate = (key: readonly unknown[]) =>
    void queryClient.invalidateQueries({ queryKey: key });
  switch (event) {
    case 'message.created': {
      const parsed = MessageView.safeParse(data.message);
      if (parsed.success) addMessageToCache(queryClient, parsed.data);
      else if (typeof data.conversationId === 'string')
        invalidate(keys.messages(data.conversationId));
      invalidate(keys.conversations);
      invalidate(keys.unread);
      break;
    }
    case 'conversation.read':
      invalidate(keys.conversations);
      invalidate(keys.unread);
      break;
    case 'notification.created':
    case 'notification.read':
      invalidate(keys.notifications);
      invalidate(keys.unread);
      break;
    case 'connection.updated':
      invalidate(keys.connectionsAll);
      invalidate(keys.conversations);
      invalidate(['startups', 'relationship']);
      break;
    case 'deal.updated':
      if (typeof data.dealId === 'string') invalidate(keys.deal(data.dealId));
      invalidate(keys.dealsAll);
      break;
    default:
      break;
  }
}

function resync(queryClient: QueryClient): void {
  for (const key of [
    keys.unread,
    keys.conversations,
    keys.notifications,
    keys.connectionsAll,
    keys.dealsAll,
    ['messages'],
    ['deal'],
  ]) {
    void queryClient.invalidateQueries({ queryKey: key });
  }
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    });
  });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { state, getToken } = useSession();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<RealtimeStatus>('connecting');
  const authenticated = state.status === 'authenticated';

  useEffect(() => {
    if (!authenticated) return;
    const controller = new AbortController();
    const { signal } = controller;
    // A function, so TypeScript does not narrow `aborted` across awaits.
    const stopped = () => signal.aborted;

    async function run() {
      let attempt = 0;
      let connectedBefore = false;
      while (!signal.aborted) {
        try {
          const token = await getToken();
          if (token === null) return;
          const response = await fetch(buildApiUrl('/realtime/stream'), {
            headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
            signal,
            cache: 'no-store',
          });
          if (!response.ok || response.body === null)
            throw new Error(`stream ${String(response.status)}`);
          attempt = 0;
          setStatus('live');
          if (connectedBefore) resync(queryClient);
          connectedBefore = true;

          const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
          let buffer = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            buffer += value;
            let index: number;
            while ((index = buffer.indexOf('\n\n')) !== -1) {
              const frame = buffer.slice(0, index);
              buffer = buffer.slice(index + 2);
              const event = /^event: (.*)$/m.exec(frame)?.[1];
              const raw = /^data: (.*)$/m.exec(frame)?.[1];
              if (event === undefined || raw === undefined) continue;
              try {
                handleEvent(queryClient, event, JSON.parse(raw) as Record<string, unknown>);
              } catch {
                // A malformed frame is ignored; the next resync repairs the cache.
              }
            }
          }
        } catch {
          // Network failure or abort: handled below.
        }
        if (stopped()) return;
        setStatus(navigator.onLine ? 'reconnecting' : 'offline');
        attempt += 1;
        await sleep(Math.min(30_000, 1000 * 2 ** Math.min(attempt, 5)), signal);
      }
    }
    void run();
    const online = () => {
      setStatus((current) => (current === 'offline' ? 'reconnecting' : current));
    };
    window.addEventListener('online', online);
    return () => {
      controller.abort();
      window.removeEventListener('online', online);
    };
  }, [authenticated, getToken, queryClient]);

  return <RealtimeContext value={status}>{children}</RealtimeContext>;
}
