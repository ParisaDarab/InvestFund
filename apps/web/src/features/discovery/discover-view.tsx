'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { SearchX, SlidersHorizontal } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';

import {
  COUNTRIES,
  CURRENCIES,
  FUNDING_PURPOSES,
  SECTORS,
  STAGES,
  STARTUP_SORTS,
} from '@investfund/shared';
import type { StartupPage } from '@investfund/shared';

import {
  filtersFromParams,
  filtersToApiQuery,
  filtersToParams,
  EMPTY_FILTERS,
  type DiscoverFilters,
} from './search-params';

import { EmptyState } from '@/components/common/empty-state';
import { ListSkeleton, QueryError } from '@/components/common/query-states';
import { StartupCard } from '@/components/startup/startup-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';

export interface DiscoverViewProps {
  initial: StartupPage | null;
  initialKey: string;
}

export function DiscoverView({ initial, initialKey }: DiscoverViewProps) {
  const t = useTranslations('discover');
  const tx = useTranslations('taxonomy');
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = filtersFromParams(Object.fromEntries(searchParams.entries()));
  const paramsKey = filtersToParams(filters).toString();
  const [draft, setDraft] = useState<DiscoverFilters>(filters);
  const [showFilters, setShowFilters] = useState(false);
  const [pending, startTransition] = useTransition();

  const query = useInfiniteQuery({
    queryKey: keys.search({ paramsKey }),
    queryFn: ({ pageParam }) => api.searchStartups(filtersToApiQuery(filters, pageParam)),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    ...(initial !== null && initialKey === paramsKey
      ? { initialData: { pages: [initial], pageParams: [undefined] } }
      : {}),
  });

  const apply = (next: DiscoverFilters) => {
    const params = filtersToParams(next).toString();
    startTransition(() => {
      router.replace(params === '' ? pathname : `${pathname}?${params}`, { scroll: false });
    });
  };
  const set = (key: keyof DiscoverFilters) => (event: { target: { value: string } }) => {
    const next = { ...draft, [key]: event.target.value };
    setDraft(next);
    if (key !== 'q' && key !== 'amountMin' && key !== 'amountMax') apply(next);
  };

  const startups = query.data?.pages.flatMap((page) => page.data) ?? [];
  const activeCount = Object.entries(filters).filter(
    ([key, value]) => value !== '' && key !== 'sort' && key !== 'q',
  ).length;

  return (
    <div className="grid gap-8 lg:grid-cols-[17rem_1fr]">
      <aside className="space-y-4">
        <form
          role="search"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            apply(draft);
          }}
        >
          <Label htmlFor="discover-q">{t('searchLabel')}</Label>
          <div className="flex gap-2">
            <Input
              id="discover-q"
              value={draft.q}
              maxLength={100}
              onChange={set('q')}
              placeholder={t('searchPlaceholder')}
            />
            <Button type="submit" variant="secondary">
              {t('search')}
            </Button>
          </div>
        </form>
        <Button
          variant="outline"
          className="w-full lg:hidden"
          aria-expanded={showFilters}
          aria-controls="discover-filters"
          onClick={() => {
            setShowFilters((value) => !value);
          }}
        >
          <SlidersHorizontal aria-hidden="true" />
          {t('filters', { count: activeCount })}
        </Button>
        <div id="discover-filters" className={`${showFilters ? 'grid' : 'hidden'} gap-4 lg:grid`}>
          <div className="grid gap-1.5">
            <Label htmlFor="f-sector">{t('sector')}</Label>
            <NativeSelect id="f-sector" value={draft.sector} onChange={set('sector')}>
              <option value="">{t('any')}</option>
              {SECTORS.map((value) => (
                <option key={value} value={value}>
                  {tx(`sector.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-stage">{t('stage')}</Label>
            <NativeSelect id="f-stage" value={draft.stage} onChange={set('stage')}>
              <option value="">{t('any')}</option>
              {STAGES.map((value) => (
                <option key={value} value={value}>
                  {tx(`stage.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-country">{t('country')}</Label>
            <NativeSelect id="f-country" value={draft.country} onChange={set('country')}>
              <option value="">{t('any')}</option>
              {COUNTRIES.map((value) => (
                <option key={value} value={value}>
                  {tx(`country.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="f-purpose">{t('purpose')}</Label>
            <NativeSelect id="f-purpose" value={draft.purpose} onChange={set('purpose')}>
              <option value="">{t('any')}</option>
              {FUNDING_PURPOSES.map((value) => (
                <option key={value} value={value}>
                  {tx(`purpose.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
          <fieldset className="grid gap-1.5">
            <legend className="mb-1.5 text-sm font-medium">{t('amount')}</legend>
            <NativeSelect
              aria-label={t('currency')}
              value={draft.currency}
              onChange={set('currency')}
            >
              <option value="">{t('anyCurrency')}</option>
              {CURRENCIES.map((value) => (
                <option key={value} value={value}>
                  {tx(`currency.${value}`)}
                </option>
              ))}
            </NativeSelect>
            <div className="flex items-center gap-2">
              <Input
                inputMode="numeric"
                aria-label={t('amountMin')}
                placeholder={t('min')}
                value={draft.amountMin}
                onChange={set('amountMin')}
                onBlur={() => {
                  apply(draft);
                }}
              />
              <span aria-hidden="true">–</span>
              <Input
                inputMode="numeric"
                aria-label={t('amountMax')}
                placeholder={t('max')}
                value={draft.amountMax}
                onChange={set('amountMax')}
                onBlur={() => {
                  apply(draft);
                }}
              />
            </div>
            <p className="type-meta">{t('amountHint')}</p>
          </fieldset>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(EMPTY_FILTERS);
              apply(EMPTY_FILTERS);
            }}
          >
            {t('clear')}
          </Button>
        </div>
      </aside>

      <section aria-labelledby="results-heading" aria-busy={pending || query.isFetching}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="results-heading" className="type-meta" aria-live="polite">
            {query.isSuccess
              ? t('results', { count: startups.length, more: query.hasNextPage ? 'yes' : 'no' })
              : t('searching')}
          </h2>
          <div className="flex items-center gap-2">
            <Label htmlFor="f-sort" className="type-meta">
              {t('sort')}
            </Label>
            <NativeSelect id="f-sort" value={draft.sort} onChange={set('sort')} className="w-48">
              {STARTUP_SORTS.map((value) => (
                <option key={value} value={value}>
                  {t(`sorts.${value}`)}
                </option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {query.isPending ? (
          <ListSkeleton rows={4} />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        ) : startups.length === 0 ? (
          <EmptyState icon={SearchX} title={t('emptyTitle')} description={t('emptyBody')} />
        ) : (
          <>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {startups.map((startup) => (
                <li key={startup.id}>
                  <StartupCard startup={startup} />
                </li>
              ))}
            </ul>
            {query.hasNextPage ? (
              <div className="mt-6 flex justify-center">
                <Button
                  variant="outline"
                  onClick={() => void query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  );
}
