'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Handshake, Plus } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { OfferTerms } from '@investfund/shared';

import { OfferForm } from './offer-form';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { money, relativeTime } from '@/lib/format';

function NewProposal({ presetConnectionId }: { presetConnectionId: string | null }) {
  const t = useTranslations('deals.new');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const connections = useQuery({
    queryKey: keys.connections({ direction: 'all', status: 'accepted' }),
    queryFn: () => api.connections({ direction: 'all', status: 'accepted', limit: 50 }),
    enabled: open,
  });
  const accepted = (connections.data?.data ?? []).filter((c) => !c.blocked);
  const [connectionId, setConnectionId] = useState(presetConnectionId ?? '');
  const selected = accepted.find((c) => c.id === connectionId);
  const startup = useQuery({
    queryKey: ['startup', 'slug', selected?.startup.slug],
    queryFn: () => api.startupBySlug(selected?.startup.slug ?? ''),
    enabled: selected !== undefined,
  });
  const create = useMutation({
    mutationFn: (terms: OfferTerms) => api.createDeal(connectionId, terms),
    onSuccess: async (deal) => {
      await queryClient.invalidateQueries({ queryKey: keys.dealsAll });
      setOpen(false);
      toast({ title: t('sent') });
      router.push(`/app/deals/${deal.id}`);
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button data-testid="new-proposal">
          <Plus aria-hidden="true" />
          {t('button')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {connections.isPending ? (
          <ListSkeleton rows={1} />
        ) : accepted.length === 0 ? (
          <p className="type-meta">{t('noConnections')}</p>
        ) : (
          <div className="grid gap-4">
            <Field id="np-connection" label={t('connection')}>
              <NativeSelect
                id="np-connection"
                value={connectionId}
                onChange={(e) => {
                  setConnectionId(e.target.value);
                }}
                data-testid="proposal-connection"
              >
                <option value="" disabled>
                  {t('choose')}
                </option>
                {accepted.map((c) => (
                  <option key={c.id} value={c.id}>
                    {t('connectionOption', {
                      startup: c.startup.name,
                      name:
                        c.viewerRole === 'requester'
                          ? c.founder.displayName
                          : c.supporter.displayName,
                    })}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {startup.data === undefined ? null : (
              <OfferForm
                currency={startup.data.currency}
                milestones={startup.data.milestones}
                submitLabel={t('submit')}
                busy={create.isPending}
                onSubmit={(terms) => {
                  create.mutate(terms);
                }}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export function DealsPage() {
  const t = useTranslations('deals');
  const params = useSearchParams();
  const connectionId = params.get('connectionId');
  const [status, setStatus] = useState<'open' | 'closed' | 'all'>('open');
  const query = useInfiniteQuery({
    queryKey: keys.deals({ status, connectionId }),
    queryFn: ({ pageParam }) => api.deals({ status, connectionId, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<NewProposal presetConnectionId={connectionId} />}
      />
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as 'open');
        }}
      >
        <TabsList>
          <TabsTrigger value="open">{t('tabs.open')}</TabsTrigger>
          <TabsTrigger value="closed">{t('tabs.closed')}</TabsTrigger>
          <TabsTrigger value="all">{t('tabs.all')}</TabsTrigger>
        </TabsList>
      </Tabs>
      {connectionId === null ? null : (
        <p className="type-meta">
          {t('filtered')}{' '}
          <Link href="/app/deals" className="text-primary">
            {t('clearFilter')}
          </Link>
        </p>
      )}
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={Handshake} title={t('emptyTitle')} description={t('emptyBody')} />
      ) : (
        <ul className="grid gap-3">
          {items.map((d) => (
            <li key={d.id}>
              <Link href={`/app/deals/${d.id}`} className="block">
                <Card
                  className="hover:shadow-raised flex flex-wrap items-center justify-between gap-3 p-5 transition-shadow"
                  data-testid="deal-row"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">{d.startup.name}</p>
                    <p className="type-meta">
                      {t('row', {
                        counterpart:
                          d.viewerRole === 'supporter'
                            ? d.founder.displayName
                            : d.supporter.displayName,
                        amount: money(d.latestOffer.amountMinor, d.latestOffer.currency),
                        when: relativeTime(d.updatedAt),
                      })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {d.awaitingViewer ? (
                      <span className="text-primary text-xs font-semibold">{t('yourTurn')}</span>
                    ) : null}
                    <StatusLabel kind="deal" status={d.status} />
                  </div>
                </Card>
              </Link>
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
