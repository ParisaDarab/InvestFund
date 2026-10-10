import { queryOptions, useQuery } from '@tanstack/react-query';

import { HealthReport } from '@investfund/shared';

import { apiFetch } from './client';
import { createQueryKeys, retryOnceOnNetworkError } from './query';

const keys = createQueryKeys('health');

export const healthKeys = {
  all: keys.all,
  ready: () => [...keys.all, 'ready'] as const,
};

/**
 * `GET /health/ready` (docs/API.md §5). It is served at the API root, not under `/api/v1`, and
 * answers `503` with a `HealthReport` when a dependency is down, so 503 is parsed, not thrown.
 */
export function fetchHealthReport(signal?: AbortSignal): Promise<HealthReport> {
  return apiFetch('/health/ready', {
    schema: HealthReport,
    prefix: false,
    acceptStatuses: [503],
    signal,
  });
}

export function healthQueryOptions() {
  return queryOptions({
    queryKey: healthKeys.ready(),
    queryFn: ({ signal }) => fetchHealthReport(signal),
    retry: retryOnceOnNetworkError,
  });
}

/** API readiness. Example of the per-endpoint hook pattern; used by the dev status badge. */
export function useHealth() {
  return useQuery(healthQueryOptions());
}
