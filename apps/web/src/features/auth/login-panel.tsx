'use client';

import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { useSession } from '@/lib/auth/session';

const ERRORS = [
  'cancelled',
  'failed',
  'state',
  'email_unverified',
  'account_conflict',
  'suspended',
] as const;

/** Only same-app relative paths are accepted as a return target (no open redirects). */
export function safeReturnTo(value: string | null): string | undefined {
  if (value === null || !/^\/(?![/\\])[^\s]*$/.test(value)) return undefined;
  return value.replace(/^\/en-GB(?=\/|$)/, '') || '/';
}

/**
 * The developer sign-in hint is only for the mock Google provider (infra/mocks/google), where it
 * picks the account. Real Google also treats `login_hint` as a harmless account pre-selection.
 */
const DEV_HINTS = process.env.NEXT_PUBLIC_AUTH_DEV_HINTS === 'true';

export function LoginPanel() {
  const t = useTranslations('login');
  const params = useSearchParams();
  const router = useRouter();
  const { state } = useSession();
  const [hint, setHint] = useState('');
  const error = params.get('error');
  const returnTo = safeReturnTo(params.get('returnTo'));

  useEffect(() => {
    if (state.status === 'authenticated') router.replace(returnTo ?? '/app');
  }, [state.status, router, returnTo]);

  const href = api.googleStartUrl(
    returnTo,
    DEV_HINTS && hint.trim() !== '' ? hint.trim() : undefined,
  );
  return (
    <Card className="shadow-raised w-full max-w-md space-y-6 self-start p-8" data-testid="login">
      <div className="space-y-2">
        <h1 className="type-h1">{t('title')}</h1>
        <p className="text-muted-foreground">{t('description')}</p>
      </div>
      {error !== null && (ERRORS as readonly string[]).includes(error) ? (
        <p
          role="alert"
          className="text-destructive rounded-md border border-destructive/40 p-3 text-sm"
          data-testid="login-error"
        >
          {t(`errors.${error as (typeof ERRORS)[number]}`)}
        </p>
      ) : null}
      {DEV_HINTS ? (
        <div className="grid gap-1.5 rounded-md border border-dashed border-border p-3">
          <Label htmlFor="login-hint">{t('devHint')}</Label>
          <Input
            id="login-hint"
            type="email"
            value={hint}
            onChange={(e) => {
              setHint(e.target.value);
            }}
            data-testid="login-hint"
          />
          <p className="type-meta">{t('devHintBody')}</p>
        </div>
      ) : null}
      <a
        href={href}
        className={buttonVariants({ size: 'lg', variant: 'outline', className: 'w-full' })}
        data-testid="google-sign-in"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5">
          <path
            fill="currentColor"
            d="M21.35 11.1H12v2.98h5.35c-.23 1.5-1.7 4.4-5.35 4.4-3.22 0-5.85-2.67-5.85-5.96S8.78 6.56 12 6.56c1.83 0 3.06.78 3.76 1.45l2.56-2.47C16.7 4.03 14.56 3 12 3 7.03 3 3 7.03 3 12s4.03 9 9 9c5.2 0 8.64-3.65 8.64-8.8 0-.59-.06-1.04-.14-1.48z"
          />
        </svg>
        {t('google')}
      </a>
      <p className="type-meta">{t('legal')}</p>
      {state.status === 'error' ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('retry')}
        </Button>
      ) : null}
    </Card>
  );
}
