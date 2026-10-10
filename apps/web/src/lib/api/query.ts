import { isApiError } from './client';

/**
 * Query-key factory for one API domain, so that keys are built in one place and invalidation can
 * target a whole domain (`all`), every list (`lists()`) or one item (`detail(id)`).
 *
 * @example
 * const startupKeys = createQueryKeys('startups');
 * startupKeys.detail(id); // ['startups', 'detail', id]
 */
export function createQueryKeys<const Domain extends string>(domain: Domain) {
  const all = [domain] as const;
  return {
    all,
    lists: () => [...all, 'list'] as const,
    list: <const Params extends Readonly<Record<string, unknown>>>(params: Params) =>
      [...all, 'list', params] as const,
    details: () => [...all, 'detail'] as const,
    detail: (id: string) => [...all, 'detail', id] as const,
  };
}

/**
 * TanStack Query `retry` predicate: retry once, and only when no response arrived (`network`).
 * HTTP, problem and contract errors would fail again the same way.
 */
export function retryOnceOnNetworkError(failureCount: number, error: unknown): boolean {
  return failureCount < 1 && isApiError(error) && error.kind === 'network';
}
