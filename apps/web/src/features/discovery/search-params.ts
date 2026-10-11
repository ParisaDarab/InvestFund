/** Discovery filters <-> URL search params (the URL is the single source of truth). */
import {
  COUNTRIES,
  CURRENCIES,
  FUNDING_PURPOSES,
  SECTORS,
  STAGES,
  STARTUP_SORTS,
} from '@investfund/shared';

export interface DiscoverFilters {
  q: string;
  sector: string;
  stage: string;
  country: string;
  purpose: string;
  currency: string;
  /** Major units as typed. */
  amountMin: string;
  amountMax: string;
  sort: string;
}

export const EMPTY_FILTERS: DiscoverFilters = {
  q: '',
  sector: '',
  stage: '',
  country: '',
  purpose: '',
  currency: '',
  amountMin: '',
  amountMax: '',
  sort: 'newest',
};

const oneOf = (value: string | undefined, allowed: readonly string[]) =>
  value !== undefined && allowed.includes(value) ? value : '';
const amount = (value: string | undefined) =>
  value !== undefined && /^\d{1,12}$/.test(value) ? value : '';

type Params = Record<string, string | string[] | undefined>;
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Parses (and sanitises) untrusted URL params. */
export function filtersFromParams(params: Params): DiscoverFilters {
  return {
    q: (first(params.q) ?? '').slice(0, 100),
    sector: oneOf(first(params.sector), SECTORS),
    stage: oneOf(first(params.stage), STAGES),
    country: oneOf(first(params.country), COUNTRIES),
    purpose: oneOf(first(params.purpose), FUNDING_PURPOSES),
    currency: oneOf(first(params.currency), CURRENCIES),
    amountMin: amount(first(params.amountMin)),
    amountMax: amount(first(params.amountMax)),
    sort: oneOf(first(params.sort), STARTUP_SORTS) || 'newest',
  };
}

export function filtersToParams(filters: DiscoverFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters) as [string, string][]) {
    if (value !== '' && !(key === 'sort' && value === 'newest')) params.set(key, value);
  }
  return params;
}

/** API query (amounts converted from whole major units to minor units). */
export function filtersToApiQuery(filters: DiscoverFilters, cursor?: string) {
  return {
    q: filters.q || undefined,
    sector: filters.sector || undefined,
    stage: filters.stage || undefined,
    country: filters.country || undefined,
    purpose: filters.purpose || undefined,
    currency: filters.currency || undefined,
    amountMin:
      filters.amountMin === '' ? undefined : `${filters.amountMin}00`.replace(/^0+(?=\d)/, ''),
    amountMax:
      filters.amountMax === '' ? undefined : `${filters.amountMax}00`.replace(/^0+(?=\d)/, ''),
    sort: filters.sort,
    cursor,
    limit: 12,
  };
}
