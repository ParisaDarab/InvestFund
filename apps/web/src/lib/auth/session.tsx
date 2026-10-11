'use client';

/**
 * Browser session: the access token lives in memory only (never in storage). On load and before
 * expiry it is renewed through `POST /auth/refresh`, which uses the httpOnly refresh cookie.
 * Server-side authorisation stays in the API; this context only decides what to render.
 */
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { CurrentUser } from '@investfund/shared';

import type { ReactNode } from 'react';

import { isApiError, setAccessTokenProvider } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous' }
  | { status: 'error' }
  | { status: 'authenticated'; user: CurrentUser };

interface SessionContextValue {
  state: SessionState;
  /** The current access token, refreshed when close to expiry; `null` when signed out. */
  getToken: () => Promise<string | null>;
  /** Re-reads the session (after onboarding or settings changes). */
  reload: () => Promise<void>;
  setUser: (user: CurrentUser) => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

/** Renew this long before the access token expires. */
const RENEW_MARGIN_MS = 60_000;

let inflight: Promise<Awaited<ReturnType<typeof api.refresh>>> | null = null;
/** One refresh at a time per tab (React strict mode and parallel callers share it). */
function refreshOnce() {
  inflight ??= api.refresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const token = useRef<{ value: string; expiresAt: number } | null>(null);
  /** Set after the server said "no session": public API calls then go out without retrying refresh. */
  const anonymous = useRef(false);
  const queryClient = useQueryClient();

  const renew = useCallback(async (): Promise<string | null> => {
    try {
      const session = await refreshOnce();
      token.current = {
        value: session.accessToken,
        expiresAt: Date.now() + session.expiresIn * 1000,
      };
      anonymous.current = false;
      setState({ status: 'authenticated', user: session.user });
      return session.accessToken;
    } catch (error) {
      token.current = null;
      const signedOut = isApiError(error) && error.kind !== 'network';
      anonymous.current = signedOut;
      setState(signedOut ? { status: 'anonymous' } : { status: 'error' });
      return null;
    }
  }, []);

  const getToken = useCallback(async () => {
    const current = token.current;
    if (current !== null && current.expiresAt - Date.now() > RENEW_MARGIN_MS) return current.value;
    if (anonymous.current) return null;
    return renew();
  }, [renew]);

  useEffect(() => {
    setAccessTokenProvider(() => getToken());
    void renew();
    return () => {
      setAccessTokenProvider(null);
    };
  }, [getToken, renew]);

  const value = useMemo<SessionContextValue>(
    () => ({
      state,
      getToken,
      reload: async () => {
        anonymous.current = false;
        await renew();
      },
      setUser: (user) => {
        setState({ status: 'authenticated', user });
      },
      signOut: async () => {
        try {
          await api.logout();
        } finally {
          token.current = null;
          anonymous.current = true;
          queryClient.clear();
          setState({ status: 'anonymous' });
        }
      },
    }),
    [state, getToken, renew, queryClient],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionContextValue {
  const value = use(SessionContext);
  if (value === null) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

/** The signed-in user; only call below a guard that guarantees authentication. */
export function useCurrentUser(): CurrentUser {
  const { state } = useSession();
  if (state.status !== 'authenticated')
    throw new Error('useCurrentUser needs an authenticated session');
  return state.user;
}
