'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import { safeReturnTo } from './login-panel';

import { Skeleton } from '@/components/ui/skeleton';
import { useRouter } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/session';

/** Lands after the Google callback: the session cookie is set, so load it and route on. */
export function AuthComplete() {
  const t = useTranslations('authComplete');
  const { state } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login?error=failed');
    if (state.status !== 'authenticated') return;
    const { user } = state;
    if (user.role === null || !user.profileComplete) {
      router.replace(
        returnTo === undefined
          ? '/onboarding'
          : `/onboarding?returnTo=${encodeURIComponent(returnTo)}`,
      );
    } else {
      router.replace(returnTo ?? (user.role === 'admin' ? '/app/admin' : '/app'));
    }
  }, [state, router, returnTo]);

  return (
    <div className="w-full max-w-md space-y-3" role="status" aria-live="polite">
      <p className="font-medium">{t('signingIn')}</p>
      <Skeleton className="h-4 w-2/3" />
    </div>
  );
}
