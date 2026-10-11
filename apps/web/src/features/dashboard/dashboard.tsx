'use client';

import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Bell, Handshake, MessagesSquare, Rocket, Sparkles, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect } from 'react';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { PageHeader } from '@/components/common/page-header';
import { ListSkeleton } from '@/components/common/query-states';
import { StatusLabel } from '@/components/common/status-label';
import { StartupCard } from '@/components/startup/startup-card';
import { buttonVariants } from '@/components/ui/button-variants';
import { Card } from '@/components/ui/card';
import { Link, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useCurrentUser } from '@/lib/auth/session';
import { money } from '@/lib/format';

function Stat({
  icon: Icon,
  label,
  value,
  href,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  href: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="shadow-card hover:shadow-raised flex items-center gap-4 p-5 transition-shadow">
        <span className="bg-primary/10 text-primary grid size-10 place-items-center rounded-md">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div>
          <p className="text-2xl font-semibold tabular-nums">{value}</p>
          <p className="type-meta">{label}</p>
        </div>
      </Card>
    </Link>
  );
}

function ActionDeals() {
  const t = useTranslations('dashboard');
  const deals = useQuery({
    queryKey: keys.deals({ status: 'open' }),
    queryFn: () => api.deals({ status: 'open', limit: 20 }),
  });
  const waiting = (deals.data?.data ?? []).filter((d) => d.awaitingViewer);
  return (
    <Card className="space-y-3 p-5">
      <h2 className="type-h3">{t('needsYou')}</h2>
      {deals.isPending ? (
        <ListSkeleton rows={1} />
      ) : waiting.length === 0 ? (
        <p className="type-meta">{t('nothingWaiting')}</p>
      ) : (
        <ul className="grid gap-2">
          {waiting.map((d) => (
            <li key={d.id}>
              <Link
                href={`/app/deals/${d.id}`}
                className="hover:bg-muted flex items-center justify-between gap-2 rounded-md p-2 text-sm"
              >
                <span className="truncate">
                  {d.startup.name} · {money(d.latestOffer.amountMinor, d.latestOffer.currency)}
                </span>
                <StatusLabel kind="deal" status={d.status} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function FounderDashboard() {
  const t = useTranslations('dashboard');
  const startups = useQuery({ queryKey: keys.myStartups, queryFn: api.myStartups });
  const pending = useQuery({
    queryKey: keys.connections({ direction: 'incoming', status: 'pending' }),
    queryFn: () => api.connections({ direction: 'incoming', status: 'pending', limit: 50 }),
  });
  const unread = useQuery({ queryKey: keys.unread, queryFn: api.unread });
  const list = startups.data?.data ?? [];
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={Users}
          label={t('pendingRequests')}
          value={pending.data?.data.length ?? '–'}
          href="/app/connections"
        />
        <Stat
          icon={MessagesSquare}
          label={t('unreadMessages')}
          value={unread.data?.messages ?? '–'}
          href="/app/messages"
        />
        <Stat
          icon={Bell}
          label={t('unreadNotifications')}
          value={unread.data?.notifications ?? '–'}
          href="/app/notifications"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Card className="space-y-4 p-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="type-h3">{t('yourStartups')}</h2>
            <Link href="/app/startups/new" className={buttonVariants({ size: 'sm' })}>
              {t('newStartup')}
            </Link>
          </div>
          {startups.isPending ? (
            <ListSkeleton rows={2} />
          ) : list.length === 0 ? (
            <div className="space-y-2">
              <p className="text-muted-foreground text-sm">{t('noStartups')}</p>
              <Link href="/app/startups/new" className={buttonVariants({ variant: 'outline' })}>
                <Rocket aria-hidden="true" />
                {t('createFirst')}
              </Link>
            </div>
          ) : (
            <ul className="grid gap-2">
              {list.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/app/startups/${s.id}`}
                    className="hover:bg-muted flex items-center justify-between gap-2 rounded-md p-2"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{s.name}</span>
                      <span className="type-meta">
                        {s.status === 'draft' && s.publicationIssues.length > 0
                          ? t('issues', { count: s.publicationIssues.length })
                          : t('reported', { amount: money(s.reportedFundingMinor, s.currency) })}
                      </span>
                    </span>
                    <StatusLabel kind="startup" status={s.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <ActionDeals />
      </div>
    </>
  );
}

function SupporterDashboard() {
  const t = useTranslations('dashboard');
  const recommendations = useQuery({
    queryKey: [...keys.recommendations, 'top'],
    queryFn: () => api.recommendations(),
  });
  const unread = useQuery({ queryKey: keys.unread, queryFn: api.unread });
  const saved = useQuery({ queryKey: keys.saved, queryFn: api.saved });
  const top = (recommendations.data?.data ?? []).slice(0, 3);
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          icon={Sparkles}
          label={t('savedStartups')}
          value={saved.data?.data.length ?? '–'}
          href="/app/saved"
        />
        <Stat
          icon={MessagesSquare}
          label={t('unreadMessages')}
          value={unread.data?.messages ?? '–'}
          href="/app/messages"
        />
        <Stat
          icon={Handshake}
          label={t('unreadNotifications')}
          value={unread.data?.notifications ?? '–'}
          href="/app/notifications"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="type-h3">{t('topMatches')}</h2>
            <Link
              href="/app/recommended"
              className="text-primary inline-flex items-center gap-1 text-sm font-medium"
            >
              {t('seeAll')}
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
          {recommendations.isPending ? (
            <ListSkeleton rows={2} />
          ) : top.length === 0 ? (
            <p className="type-meta">{t('noMatches')}</p>
          ) : (
            <ul className="grid gap-4 md:grid-cols-2">
              {top.map((r) => (
                <li key={r.startup.id}>
                  <StartupCard
                    startup={r.startup}
                    extra={
                      <p className="text-sm">
                        <span className="text-primary font-semibold">
                          {t('score', { score: r.score })}
                        </span>{' '}
                        · {r.explanation}
                      </p>
                    }
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
        <ActionDeals />
      </div>
    </>
  );
}

export function Dashboard() {
  const t = useTranslations('dashboard');
  const user = useCurrentUser();
  const router = useRouter();
  useEffect(() => {
    if (user.role === 'admin') router.replace('/app/admin');
  }, [user.role, router]);
  if (user.role === 'admin') return null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={t('title', { name: user.name.split(' ')[0] ?? user.name })}
        description={t(user.role === 'founder' ? 'founderBody' : 'supporterBody')}
      />
      {user.role === 'founder' ? <FounderDashboard /> : <SupporterDashboard />}
    </div>
  );
}
