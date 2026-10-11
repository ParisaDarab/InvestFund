'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { DealAction, DealView, OfferTerms } from '@investfund/shared';

import { OfferCard } from './offer-card';
import { OfferForm } from './offer-form';

import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
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
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser } from '@/lib/auth/session';
import { dateTime } from '@/lib/format';

const REASON_ACTIONS: ReadonlySet<DealAction> = new Set([
  'cancel',
  'request_cancellation',
  'dispute_receipt',
]);
const CONFIRM_ACTIONS: ReadonlySet<DealAction> = new Set([
  'report_funding',
  'confirm_receipt',
  'confirm_cancellation',
]);

function TermsDialog({
  deal,
  mode,
  onDone,
}: {
  deal: DealView;
  mode: 'counter' | 'revise';
  onDone: () => void;
}) {
  const t = useTranslations('deals.detail');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const startup = useQuery({
    queryKey: ['startup', 'slug', deal.startup.slug],
    queryFn: () => api.startupBySlug(deal.startup.slug),
    enabled: open,
  });
  const mutation = useMutation({
    mutationFn: (terms: OfferTerms) =>
      api.respondToOffer(deal.id, deal.currentOfferId ?? '', { action: mode, terms }),
    onSuccess: (updated) => {
      queryClient.setQueryData(keys.deal(deal.id), updated);
      void queryClient.invalidateQueries({ queryKey: keys.dealsAll });
      toast({ title: t(`done.${mode}`) });
      setOpen(false);
      onDone();
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={mode === 'counter' ? 'secondary' : 'outline'}
          data-testid={`offer-${mode}`}
        >
          {t(`actions.${mode}`)}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t(`${mode}Title`)}</DialogTitle>
          <DialogDescription>{t(`${mode}Body`)}</DialogDescription>
        </DialogHeader>
        <OfferForm
          currency={deal.latestOffer.currency}
          milestones={startup.data?.milestones ?? []}
          initial={deal.latestOffer}
          submitLabel={t(`actions.${mode}`)}
          busy={mutation.isPending}
          onSubmit={(terms) => {
            mutation.mutate(terms);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function DealDetail({ id }: { id: string }) {
  const t = useTranslations('deals.detail');
  const ts = useTranslations('status.deal');
  const user = useCurrentUser();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: keys.deal(id), queryFn: () => api.deal(id) });
  const onUpdated = (updated: DealView) => {
    queryClient.setQueryData(keys.deal(id), updated);
    void queryClient.invalidateQueries({ queryKey: keys.dealsAll });
  };
  const respond = useMutation({
    mutationFn: (action: 'accept' | 'decline' | 'withdraw') =>
      api.respondToOffer(id, query.data?.currentOfferId ?? '', { action }),
    onSuccess: (updated, action) => {
      onUpdated(updated);
      toast({ title: t(`done.${action}`) });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
      void query.refetch();
    },
  });
  const act = useMutation({
    mutationFn: ({ action, reason }: { action: DealAction; reason?: string }) =>
      api.dealAction(id, { action, version: query.data?.version ?? 0, reason: reason ?? null }),
    onSuccess: (updated, { action }) => {
      onUpdated(updated);
      toast({ title: t(`done.${action}`) });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
      void query.refetch();
    },
  });

  if (query.isPending) return <ListSkeleton rows={4} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  const deal = query.data;
  const nameOf = (userId: string | null) =>
    userId === null
      ? t('system')
      : userId === user.id
        ? t('you')
        : userId === deal.supporter.id
          ? deal.supporter.displayName
          : deal.founder.displayName;
  const current = deal.offers.find((o) => o.id === deal.currentOfferId) ?? null;
  const history = [...deal.offers].reverse();

  return (
    <div className="space-y-6">
      <Link href="/app/deals" className="type-meta hover:text-foreground">
        {t('back')}
      </Link>
      <PageHeader
        title={t('title', { startup: deal.startup.name })}
        description={t('parties', {
          supporter: deal.supporter.displayName,
          founder: deal.founder.displayName,
        })}
        actions={<StatusLabel kind="deal" status={deal.status} />}
      />
      <p className="bg-muted/60 flex gap-2 rounded-md border border-border p-3 text-sm" role="note">
        <Info aria-hidden="true" className="text-primary mt-0.5 size-4 shrink-0" />
        {t('disclaimer')}
      </p>
      {!deal.interactive ? (
        <p className="text-warning text-sm" role="status">
          {t('notInteractive')}
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          {current !== null ? (
            <section className="space-y-3" aria-labelledby="current-offer">
              <h2 id="current-offer" className="type-h3">
                {t(current.recipientId === user.id ? 'awaitingYou' : 'awaitingThem')}
              </h2>
              <OfferCard offer={current} authorName={nameOf(current.createdById)} highlight />
              <div className="flex flex-wrap gap-2" data-testid="offer-actions">
                {deal.availableOfferActions.includes('accept') ? (
                  <ConfirmDialog
                    trigger={<Button data-testid="offer-accept">{t('actions.accept')}</Button>}
                    title={t('acceptTitle')}
                    description={t('acceptBody')}
                    confirmLabel={t('actions.accept')}
                    cancelLabel={t('cancel')}
                    onConfirm={() => respond.mutateAsync('accept')}
                  />
                ) : null}
                {deal.availableOfferActions.includes('counter') ? (
                  <TermsDialog deal={deal} mode="counter" onDone={() => undefined} />
                ) : null}
                {deal.availableOfferActions.includes('revise') ? (
                  <TermsDialog deal={deal} mode="revise" onDone={() => undefined} />
                ) : null}
                {deal.availableOfferActions.includes('decline') ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="outline" data-testid="offer-decline">
                        {t('actions.decline')}
                      </Button>
                    }
                    title={t('declineTitle')}
                    confirmLabel={t('actions.decline')}
                    cancelLabel={t('cancel')}
                    destructive
                    onConfirm={() => respond.mutateAsync('decline')}
                  />
                ) : null}
                {deal.availableOfferActions.includes('withdraw') ? (
                  <ConfirmDialog
                    trigger={
                      <Button variant="ghost" data-testid="offer-withdraw">
                        {t('actions.withdraw')}
                      </Button>
                    }
                    title={t('withdrawTitle')}
                    confirmLabel={t('actions.withdraw')}
                    cancelLabel={t('cancel')}
                    destructive
                    onConfirm={() => respond.mutateAsync('withdraw')}
                  />
                ) : null}
              </div>
            </section>
          ) : null}

          {deal.availableDealActions.length > 0 || deal.cancellation !== null ? (
            <Card className="space-y-3 p-5" data-testid="deal-actions">
              <h2 className="type-h3">{t('outcomeTitle')}</h2>
              <p className="type-meta">
                {t(`outcomeHelp.${deal.status}` as 'outcomeHelp.accepted')}
              </p>
              {deal.cancellation === null ? null : (
                <p className="text-sm">
                  {t('cancellationRequested', {
                    name: nameOf(deal.cancellation.requestedById),
                    reason: deal.cancellation.reason ?? '',
                  })}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {deal.availableDealActions.map((action) =>
                  REASON_ACTIONS.has(action) || CONFIRM_ACTIONS.has(action) ? (
                    <ConfirmDialog
                      key={action}
                      trigger={
                        <Button
                          variant={CONFIRM_ACTIONS.has(action) ? 'primary' : 'outline'}
                          data-testid={`deal-${action}`}
                        >
                          {t(`dealActions.${action}`)}
                        </Button>
                      }
                      title={t(`dealConfirm.${action}.title` as 'dealConfirm.cancel.title')}
                      description={t(`dealConfirm.${action}.body` as 'dealConfirm.cancel.body')}
                      confirmLabel={t(`dealActions.${action}`)}
                      cancelLabel={t('cancel')}
                      destructive={action === 'cancel' || action === 'confirm_cancellation'}
                      {...(REASON_ACTIONS.has(action)
                        ? { reasonLabel: t('reason'), reasonRequired: true }
                        : {})}
                      onConfirm={(reason) =>
                        act.mutateAsync({
                          action,
                          ...(REASON_ACTIONS.has(action) ? { reason } : {}),
                        })
                      }
                    />
                  ) : (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={act.isPending}
                      onClick={() => {
                        act.mutate({ action });
                      }}
                      data-testid={`deal-${action}`}
                    >
                      {t(`dealActions.${action}`)}
                    </Button>
                  ),
                )}
              </div>
            </Card>
          ) : null}

          <section className="space-y-3" aria-labelledby="history">
            <h2 id="history" className="type-h3">
              {t('history', { count: deal.offers.length })}
            </h2>
            <ol className="grid gap-3" data-testid="offer-history">
              {history.map((offer) => (
                <li key={offer.id}>
                  <OfferCard
                    offer={offer}
                    authorName={nameOf(offer.createdById)}
                    highlight={offer.id === deal.acceptedOfferId}
                  />
                </li>
              ))}
            </ol>
          </section>
        </div>

        <aside className="space-y-3">
          <h2 className="type-h3">{t('timeline')}</h2>
          <ol
            className="relative space-y-4 border-l border-border pl-5"
            data-testid="deal-timeline"
          >
            {deal.events.map((event) => (
              <li key={event.id} className="relative">
                <span
                  aria-hidden="true"
                  className="bg-primary absolute top-1.5 -left-[25px] size-2 rounded-full"
                />
                <p className="text-sm font-medium">
                  {t(`events.${event.type}` as 'events.offer_created', {
                    name: nameOf(event.actorId),
                  })}
                </p>
                <p className="type-meta">
                  {dateTime(event.createdAt)} · {ts(event.toStatus)}
                </p>
                {event.note === null ? null : (
                  <p className="text-muted-foreground mt-1 text-sm">“{event.note}”</p>
                )}
              </li>
            ))}
          </ol>
        </aside>
      </div>
    </div>
  );
}
