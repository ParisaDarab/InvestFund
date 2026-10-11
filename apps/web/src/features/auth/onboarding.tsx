'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { HandHeart, Rocket } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { safeReturnTo } from './login-panel';

import { useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { FounderProfileForm } from '@/features/profile/founder-profile-form';
import { SupporterProfileForm } from '@/features/profile/supporter-profile-form';
import { useRouter } from '@/i18n/navigation';
import { isApiError } from '@/lib/api/client';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';
import { cn } from '@/lib/cn';

export function Onboarding() {
  const t = useTranslations('onboarding');
  const { state, setUser, reload } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const returnTo = safeReturnTo(params.get('returnTo'));
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const [choice, setChoice] = useState<'founder' | 'supporter' | null>(null);

  useEffect(() => {
    if (state.status === 'anonymous') router.replace('/login?returnTo=/onboarding');
    if (state.status === 'authenticated' && state.user.role === 'admin')
      router.replace('/app/admin');
  }, [state, router]);

  const role = state.status === 'authenticated' ? state.user.role : null;
  const chooseRole = useMutation({
    mutationFn: (r: 'founder' | 'supporter') => api.chooseRole(r),
    onSuccess: (user) => {
      setUser(user);
    },
    onError: (error) => {
      toast({ title: t('roleFailed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  const existing = useQuery({
    queryKey: role === 'founder' ? keys.founderProfile : keys.supporterProfile,
    queryFn: async () => {
      try {
        return role === 'founder' ? await api.founderProfile() : await api.supporterProfile();
      } catch (error) {
        if (isApiError(error) && error.status === 404) return null;
        throw error;
      }
    },
    enabled: role === 'founder' || role === 'supporter',
  });

  if (state.status !== 'authenticated') return <Skeleton className="h-64 w-full max-w-2xl" />;
  const finish = async () => {
    await reload();
    router.replace(returnTo ?? (role === 'founder' ? '/app/startups/new' : '/app/recommended'));
  };

  return (
    <div className="w-full max-w-2xl space-y-8" data-testid="onboarding">
      <ol className="type-meta flex gap-4" aria-label={t('progress')}>
        <li
          className={cn(role === null && 'text-foreground font-medium')}
          aria-current={role === null ? 'step' : undefined}
        >
          {t('step1')}
        </li>
        <li aria-hidden="true">→</li>
        <li
          className={cn(role !== null && 'text-foreground font-medium')}
          aria-current={role !== null ? 'step' : undefined}
        >
          {t('step2')}
        </li>
      </ol>
      {role === null ? (
        <section className="space-y-6">
          <div className="space-y-2">
            <h1 className="type-h1">{t('roleTitle', { name: state.user.name })}</h1>
            <p className="text-muted-foreground">{t('roleBody')}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2" role="radiogroup" aria-label={t('roleLabel')}>
            {(['founder', 'supporter'] as const).map((r) => {
              const Icon = r === 'founder' ? Rocket : HandHeart;
              const selected = choice === r;
              return (
                <button
                  key={r}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  data-testid={`role-${r}`}
                  onClick={() => {
                    setChoice(r);
                  }}
                  className={cn(
                    'rounded-lg border p-6 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                    selected ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted',
                  )}
                >
                  <Icon aria-hidden="true" className="text-primary mb-3 size-6" />
                  <p className="font-semibold">{t(`${r}.title`)}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{t(`${r}.body`)}</p>
                </button>
              );
            })}
          </div>
          <p className="type-meta">{t('roleOnce')}</p>
          <Button
            disabled={choice === null || chooseRole.isPending}
            onClick={() => {
              if (choice !== null) chooseRole.mutate(choice);
            }}
            data-testid="confirm-role"
          >
            {t('continue')}
          </Button>
        </section>
      ) : (
        <Card className="space-y-6 p-6 sm:p-8">
          <div className="space-y-2">
            <h1 className="type-h1">
              {t(role === 'founder' ? 'founderProfileTitle' : 'supporterProfileTitle')}
            </h1>
            <p className="text-muted-foreground">
              {t(role === 'founder' ? 'founderProfileBody' : 'supporterProfileBody')}
            </p>
          </div>
          {existing.isPending ? (
            <Skeleton className="h-64 w-full" />
          ) : role === 'founder' ? (
            <FounderProfileForm
              initial={existing.data && 'headline' in existing.data ? existing.data : null}
              onSaved={() => void finish()}
              submitLabel={t('finish')}
            />
          ) : (
            <SupporterProfileForm
              initial={existing.data && 'sectors' in existing.data ? existing.data : null}
              onSaved={() => void finish()}
              submitLabel={t('finish')}
            />
          )}
        </Card>
      )}
    </div>
  );
}
