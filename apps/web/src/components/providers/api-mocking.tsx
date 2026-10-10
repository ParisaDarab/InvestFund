'use client';

import { useEffect, useState } from 'react';

import type { ReactNode } from 'react';

/**
 * Dev-only opt-in: `next dev` with `NEXT_PUBLIC_API_MOCKING=enabled`. Both values are inlined at
 * build time, so in a production build this is the literal `false`, the dynamic import below is
 * removed and neither MSW nor the worker ever reach the browser.
 */
const API_MOCKING_ENABLED =
  process.env.NODE_ENV === 'development' && process.env.NEXT_PUBLIC_API_MOCKING === 'enabled';

export interface ApiMockingProps {
  children: ReactNode;
}

/**
 * Starts the MSW browser worker before rendering the app, so the first queries are already
 * mocked. Without the opt-in it renders its children straight away.
 */
export function ApiMocking({ children }: ApiMockingProps) {
  const [ready, setReady] = useState(!API_MOCKING_ENABLED);

  useEffect(() => {
    if (!API_MOCKING_ENABLED) return;
    let active = true;
    import('@/mocks/browser')
      .then(({ startApiMocking }) => startApiMocking())
      .catch((error: unknown) => {
        console.warn(
          '[msw] Could not start API mocking; requests go to the real API. ' +
            'Run `pnpm --filter @investfund/web msw:init` to generate public/mockServiceWorker.js.',
          error,
        );
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return ready ? children : null;
}
