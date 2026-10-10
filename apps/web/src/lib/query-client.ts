import { QueryClient } from '@tanstack/react-query';

/**
 * Shared TanStack Query defaults: one retry for queries, none for mutations (side effects must
 * never be repeated silently), and no refetch on window focus.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 30_000,
      },
      mutations: {
        retry: false,
      },
    },
  });
}
