'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

import { ApiMocking } from './api-mocking';

import type { ReactNode } from 'react';

import { createQueryClient } from '@/lib/query-client';

export interface ProvidersProps {
  children: ReactNode;
}

/**
 * Client-side providers shared by every route: theme (dark by default, class on <html>, system
 * option available), TanStack Query and the dev-only MSW opt-in (`ApiMocking`). next-intl's client provider is rendered by the locale
 * layout because it needs the server-resolved locale and messages.
 */
export function Providers({ children }: ProvidersProps) {
  // One QueryClient per browser session (and per server request), never shared across users.
  const [queryClient] = useState(createQueryClient);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        <ApiMocking>{children}</ApiMocking>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
