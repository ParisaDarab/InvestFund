'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Rocket } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { CURRENCIES } from '@investfund/shared';

import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { useToast } from '@/components/feedback/toaster';
import { Field } from '@/components/forms/field';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { moneyCompact } from '@/lib/format';

export function MyStartups() {
  const t = useTranslations('myStartups');
  const query = useQuery({ queryKey: keys.myStartups, queryFn: api.myStartups });
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <Link href="/app/startups/new" className={buttonVariants()} data-testid="new-startup">
            <Plus aria-hidden="true" />
            {t('new')}
          </Link>
        }
      />
      {query.isPending ? (
        <ListSkeleton />
      ) : query.isError ? (
        <QueryError error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState
          icon={Rocket}
          title={t('emptyTitle')}
          description={t('emptyBody')}
          action={
            <Link href="/app/startups/new" className={buttonVariants()}>
              {t('new')}
            </Link>
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {query.data.data.map((s) => (
            <li key={s.id}>
              <Card className="shadow-card flex h-full flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <Link
                    href={`/app/startups/${s.id}`}
                    className="hover:text-primary text-lg font-semibold"
                  >
                    {s.name}
                  </Link>
                  <StatusLabel kind="startup" status={s.status} />
                </div>
                <p className="text-muted-foreground line-clamp-2 text-sm">
                  {s.tagline ?? t('noTagline')}
                </p>
                <p className="type-meta">
                  {t('summary', {
                    target: moneyCompact(s.targetAmountMinor, s.currency),
                    milestones: s.milestones.length,
                  })}
                </p>
                {s.status === 'draft' && s.publicationIssues.length > 0 ? (
                  <p className="text-warning text-sm">
                    {t('issues', { count: s.publicationIssues.length })}
                  </p>
                ) : null}
                <div className="mt-auto flex gap-2 pt-2">
                  <Link
                    href={`/app/startups/${s.id}`}
                    className={buttonVariants({ size: 'sm', variant: 'outline' })}
                  >
                    {t('edit')}
                  </Link>
                  {s.status === 'published' ? (
                    <Link
                      href={`/startups/${s.slug}`}
                      className={buttonVariants({ size: 'sm', variant: 'ghost' })}
                    >
                      {t('view')}
                    </Link>
                  ) : null}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function NewStartup() {
  const t = useTranslations('myStartups.create');
  const tx = useTranslations('taxonomy');
  const router = useRouter();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('GBP');
  const create = useMutation({
    mutationFn: () => api.createStartup({ name: name.trim(), currency: currency as 'GBP' }),
    onSuccess: (startup) => {
      router.replace(`/app/startups/${startup.id}`);
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  return (
    <div className="max-w-xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="p-6">
        <form
          className="grid gap-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim() !== '') create.mutate();
          }}
        >
          <Field id="ns-name" label={t('name')} hint={t('nameHint')}>
            <Input
              id="ns-name"
              value={name}
              maxLength={80}
              onChange={(e) => {
                setName(e.target.value);
              }}
              required
              data-testid="new-startup-name"
            />
          </Field>
          <Field id="ns-currency" label={t('currency')} hint={t('currencyHint')}>
            <NativeSelect
              id="ns-currency"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value);
              }}
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {tx(`currency.${c}`)}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <div>
            <Button
              type="submit"
              disabled={name.trim() === '' || create.isPending}
              data-testid="create-startup"
            >
              {t('submit')}
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
