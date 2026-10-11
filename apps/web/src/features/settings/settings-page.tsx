'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import type { FounderProfile, SupporterProfile } from '@investfund/shared';

import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton, QueryError, useErrorMessage } from '@/components/common/query-states';
import { useToast } from '@/components/feedback/toaster';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { FounderProfileForm } from '@/features/profile/founder-profile-form';
import { SupporterProfileForm } from '@/features/profile/supporter-profile-form';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser, useSession } from '@/lib/auth/session';
import { dateOnly } from '@/lib/format';

function BlockedUsers() {
  const t = useTranslations('settings.blocked');
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: keys.blocks, queryFn: api.blocks });
  const unblock = useMutation({
    mutationFn: (id: string) => api.unblock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.blocks }),
  });
  if (query.isPending) return <ListSkeleton rows={1} />;
  if (query.isError) return <QueryError error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.data.length === 0) return <p className="type-meta">{t('none')}</p>;
  return (
    <ul className="grid gap-2">
      {query.data.data.map((b) => (
        <li key={b.user.id} className="flex items-center justify-between gap-3 text-sm">
          <span>
            {b.user.displayName}{' '}
            <span className="type-meta">· {dateOnly(b.createdAt.slice(0, 10))}</span>
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              unblock.mutate(b.user.id);
            }}
            disabled={unblock.isPending}
          >
            {t('unblock')}
          </Button>
        </li>
      ))}
    </ul>
  );
}

export function SettingsPage() {
  const t = useTranslations('settings');
  const user = useCurrentUser();
  const { setUser } = useSession();
  const toast = useToast();
  const errorMessage = useErrorMessage();
  const update = useMutation({
    mutationFn: (emailNotifications: boolean) => api.updateMe({ emailNotifications }),
    onSuccess: (me) => {
      setUser(me);
      toast({ title: t('saved') });
    },
    onError: (error) => {
      toast({ title: t('failed'), description: errorMessage(error), variant: 'destructive' });
    },
  });
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Card className="grid gap-2 p-6">
        <h2 className="type-h3">{t('account')}</h2>
        <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="type-meta">{t('name')}</dt>
          <dd>{user.name}</dd>
          <dt className="type-meta">{t('email')}</dt>
          <dd>{user.email}</dd>
          <dt className="type-meta">{t('role')}</dt>
          <dd>{t(`roles.${user.role ?? 'none'}`)}</dd>
          <dt className="type-meta">{t('since')}</dt>
          <dd>{dateOnly(user.createdAt.slice(0, 10))}</dd>
        </dl>
        <p className="type-meta">{t('googleNote')}</p>
        {user.role === 'admin' ? null : (
          <div className="pt-2">
            <Link href="/app/profile" className={buttonVariants({ variant: 'outline' })}>
              {t('editProfile')}
            </Link>
          </div>
        )}
      </Card>
      <Card className="grid gap-3 p-6">
        <h2 className="type-h3">{t('notifications')}</h2>
        <label className="flex items-start gap-3 text-sm">
          <Checkbox
            checked={user.emailNotifications}
            disabled={update.isPending}
            onCheckedChange={(v) => {
              update.mutate(v === true);
            }}
            data-testid="email-notifications"
          />
          <span>
            <span className="font-medium">{t('emailLabel')}</span>
            <span className="type-meta block">{t('emailHint')}</span>
          </span>
        </label>
      </Card>
      <Card className="grid gap-3 p-6">
        <h2 className="type-h3">{t('blocked.title')}</h2>
        <BlockedUsers />
      </Card>
      <Card className="grid gap-2 p-6">
        <h2 className="type-h3">{t('data.title')}</h2>
        <p className="type-meta">{t('data.body')}</p>
      </Card>
    </div>
  );
}

export function ProfilePage() {
  const t = useTranslations('settings.profile');
  const user = useCurrentUser();
  const founder = useQuery({
    queryKey: keys.founderProfile,
    queryFn: api.founderProfile,
    enabled: user.role === 'founder',
  });
  const supporter = useQuery({
    queryKey: keys.supporterProfile,
    queryFn: api.supporterProfile,
    enabled: user.role === 'supporter',
  });
  const query = user.role === 'founder' ? founder : supporter;
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={t(user.role === 'founder' ? 'founderTitle' : 'supporterTitle')}
        description={t('description')}
      />
      <Card className="p-6">
        {query.isPending ? (
          <ListSkeleton rows={2} />
        ) : query.isError ? (
          <QueryError error={query.error} onRetry={() => void query.refetch()} />
        ) : user.role === 'founder' ? (
          <ProfileForms.Founder initial={founder.data ?? null} />
        ) : (
          <ProfileForms.Supporter initial={supporter.data ?? null} />
        )}
      </Card>
    </div>
  );
}

const ProfileForms = {
  Founder({ initial }: { initial: FounderProfile | null }) {
    const t = useTranslations('settings.profile');
    return (
      <FounderProfileForm initial={initial} onSaved={() => undefined} submitLabel={t('save')} />
    );
  },
  Supporter({ initial }: { initial: SupporterProfile | null }) {
    const t = useTranslations('settings.profile');
    return (
      <SupporterProfileForm initial={initial} onSaved={() => undefined} submitLabel={t('save')} />
    );
  },
};
