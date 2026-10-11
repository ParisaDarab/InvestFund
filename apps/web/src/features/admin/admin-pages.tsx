'use client';

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { REPORT_ACTIONS, type AdminReport } from '@investfund/shared';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { dateTime, relativeTime } from '@/lib/format';

export function AdminOverview() {
  const t = useTranslations('admin.overview');
  const query = useQuery({ queryKey: keys.adminOverview, queryFn: api.adminOverview });
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  const o = query.data;
  const groups: [string, [string, number][]][] = [
    [
      'users',
      [
        ['total', o.users.total],
        ['founders', o.users.founders],
        ['supporters', o.users.supporters],
        ['suspended', o.users.suspended],
      ],
    ],
    [
      'startups',
      [
        ['published', o.startups.published],
        ['draft', o.startups.draft],
        ['archived', o.startups.archived],
      ],
    ],
    [
      'connections',
      [
        ['pending', o.connections.pending],
        ['accepted', o.connections.accepted],
      ],
    ],
    [
      'deals',
      [
        ['negotiating', o.deals.negotiating],
        ['accepted', o.deals.accepted],
        ['completed', o.deals.completed],
        ['cancelled', o.deals.cancelled],
      ],
    ],
    ['reports', [['open', o.reports.open]]],
    [
      'emails',
      [
        ['pending', o.emails.pending],
        ['failed', o.emails.failed],
      ],
    ],
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href="/app/admin/reports" className="text-primary font-medium">
            {t('toReports')}
          </Link>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {groups.map(([group, rows]) => (
          <Card key={group} className="p-5" data-testid={`overview-${group}`}>
            <h2 className="type-h3 mb-3">{t(`groups.${group}` as 'groups.users')}</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              {rows.map(([label, value]) => (
                <div key={label} className="contents">
                  <dt className="type-meta">{t(`labels.${label}` as 'labels.total')}</dt>
                  <dd className="text-right font-semibold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
          </Card>
        ))}
      </div>
      <p className="type-meta">{t('note')}</p>
    </div>
  );
}

export function AdminReports() {
  const t = useTranslations('admin.reports');
  const tx = useTranslations('taxonomy');
  const [status, setStatus] = useState<'open' | 'resolved' | 'dismissed'>('open');
  const query = useInfiniteQuery({
    queryKey: keys.adminReports(status),
    queryFn: ({ pageParam }) => api.adminReports({ status, cursor: pageParam, limit: 20 }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  return (
    <div className="space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Tabs
        value={status}
        onValueChange={(v) => {
          setStatus(v as 'open');
        }}
      >
        <TabsList>
          {(['open', 'resolved', 'dismissed'] as const).map((s) => (
            <TabsTrigger key={s} value={s}>
              {t(`tabs.${s}`)}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState icon={ShieldCheck} title={t('emptyTitle')} />
      ) : (
        <ul className="grid gap-3">
          {items.map((r) => (
            <li key={r.id}>
              <Link href={`/app/admin/reports/${r.id}`} className="block">
                <Card
                  className="hover:shadow-raised flex flex-wrap items-center justify-between gap-3 p-4 transition-shadow"
                  data-testid="report-row"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {t(`target.${r.targetType}`)}: {r.target.label}
                    </p>
                    <p className="type-meta">
                      {tx(`reportCategory.${r.category}`)} ·{' '}
                      {t('by', { name: r.reporter.displayName })} · {relativeTime(r.createdAt)}
                      {r.relatedOpenReports > 0
                        ? ` · ${t('related', { count: r.relatedOpenReports })}`
                        : ''}
                    </p>
                  </div>
                  <StatusLabel kind="report" status={r.status} />
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

function ResolveForm({ report }: { report: AdminReport }) {
  const t = useTranslations('admin.report');
  const tx = useTranslations('taxonomy');
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [action, setAction] = useState<(typeof REPORT_ACTIONS)[number]>('none');
  const [note, setNote] = useState('');
  const allowed = REPORT_ACTIONS.filter(
    (a) => a !== 'startup_archived' || report.targetType === 'startup',
  );
  const mutation = useMutation({
    mutationFn: (status: 'resolved' | 'dismissed') =>
      api.resolveReport(report.id, {
        status,
        action: status === 'dismissed' ? 'none' : action,
        note: note.trim() || null,
      }),
    onSuccess: async (updated) => {
      queryClient.setQueryData(keys.adminReport(report.id), updated);
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      toast({ title: t('done') });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  return (
    <Card className="grid gap-4 p-5">
      <h2 className="type-h3">{t('decision')}</h2>
      <Field id="rr-action" label={t('action')} hint={t('actionHint')}>
        <NativeSelect
          id="rr-action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value as 'none');
          }}
          data-testid="report-action"
        >
          {allowed.map((a) => (
            <option key={a} value={a}>
              {tx(`reportAction.${a}`)}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field id="rr-note" label={t('note')} hint={t('noteHint')}>
        <Textarea
          id="rr-note"
          value={note}
          maxLength={2000}
          onChange={(e) => {
            setNote(e.target.value);
          }}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => {
            mutation.mutate('resolved');
          }}
          disabled={mutation.isPending}
          data-testid="resolve-report"
        >
          {t('resolve')}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            mutation.mutate('dismissed');
          }}
          disabled={mutation.isPending}
        >
          {t('dismiss')}
        </Button>
      </div>
    </Card>
  );
}

export function AdminReportDetail({ id }: { id: string }) {
  const t = useTranslations('admin.report');
  const tr = useTranslations('admin.reports');
  const tx = useTranslations('taxonomy');
  const query = useQuery({ queryKey: keys.adminReport(id), queryFn: () => api.adminReport(id) });
  if (query.isPending) return <ListSkeleton rows={3} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  const r = query.data;
  return (
    <div className="space-y-6">
      <Link href="/app/admin/reports" className="type-meta hover:text-foreground">
        {t('back')}
      </Link>
      <PageHeader
        title={`${tr(`target.${r.targetType}`)}: ${r.target.label}`}
        actions={<StatusLabel kind="report" status={r.status} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="grid gap-3 p-5 text-sm">
          <dl className="grid gap-2 sm:grid-cols-[10rem_1fr]">
            <dt className="type-meta">{t('category')}</dt>
            <dd>{tx(`reportCategory.${r.category}`)}</dd>
            <dt className="type-meta">{t('reporter')}</dt>
            <dd>{r.reporter.displayName}</dd>
            <dt className="type-meta">{t('submitted')}</dt>
            <dd>{dateTime(r.createdAt)}</dd>
            <dt className="type-meta">{t('targetDetail')}</dt>
            <dd className="break-all">
              {r.target.detail} ({r.target.status})
            </dd>
            <dt className="type-meta">{t('related')}</dt>
            <dd>{r.relatedOpenReports}</dd>
            <dt className="type-meta">{t('details')}</dt>
            <dd className="whitespace-pre-line">{r.details ?? '—'}</dd>
          </dl>
          {r.targetType === 'startup' ? (
            <Link href={`/startups/${r.target.detail}`} className="text-primary font-medium">
              {t('viewListing')}
            </Link>
          ) : null}
        </Card>
        {r.status === 'open' ? (
          <ResolveForm report={r} />
        ) : (
          <Card className="grid gap-2 p-5 text-sm">
            <h2 className="type-h3">{t('outcome')}</h2>
            <p>{tx(`reportAction.${r.action ?? 'none'}`)}</p>
            {r.resolutionNote === null ? null : (
              <p className="text-muted-foreground whitespace-pre-line">{r.resolutionNote}</p>
            )}
            <p className="type-meta">
              {t('reviewedBy', {
                name: r.reviewedBy?.displayName ?? '—',
                date: r.reviewedAt === null ? '' : dateTime(r.reviewedAt),
              })}
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
