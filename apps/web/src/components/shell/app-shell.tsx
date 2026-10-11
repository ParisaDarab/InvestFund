'use client';

import { useQuery } from '@tanstack/react-query';
import { Bell, LogOut, Menu, Settings, UserRound } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import type { UnreadCounts, UserRole } from '@investfund/shared';

import { NAV_ITEMS, isActive } from './nav-items';

import type { ReactNode } from 'react';

import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { focusRing } from '@/components/ui/focus-ring';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api/endpoints';
import { keys } from '@/lib/api/keys';
import { useSession } from '@/lib/auth/session';
import { cn } from '@/lib/cn';
import { RealtimeProvider } from '@/lib/realtime/realtime';

function Badge({ count, label }: { count: number; label: string }) {
  if (count === 0) return null;
  return (
    <span
      className="bg-primary text-primary-foreground ml-auto rounded-full px-1.5 text-xs font-semibold tabular-nums"
      aria-label={label}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function SidebarNav({
  role,
  unread,
  onNavigate,
}: {
  role: UserRole;
  unread: UnreadCounts | undefined;
  onNavigate?: () => void;
}) {
  const t = useTranslations('appNav');
  const pathname = usePathname();
  return (
    <nav aria-label={t('label')} className="flex flex-col gap-1">
      {NAV_ITEMS[role].map((item) => {
        const active = isActive(pathname, item);
        const count = item.badge === undefined ? 0 : (unread?.[item.badge] ?? 0);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            data-testid={`nav-${item.key}`}
            className={cn(
              focusRing,
              'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <item.icon aria-hidden="true" className="size-4" />
            {t(item.key)}
            <Badge count={count} label={t('unread', { count })} />
          </Link>
        );
      })}
    </nav>
  );
}

function ProfileMenu({ name, email }: { name: string; email: string }) {
  const t = useTranslations('appNav');
  const { signOut } = useSession();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (
        event instanceof KeyboardEvent
          ? event.key === 'Escape'
          : !ref.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);
  const initials = name
    .split(/\s+/)
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t('profileMenu')}
        onClick={() => {
          setOpen((v) => !v);
        }}
        className={cn(
          focusRing,
          'bg-primary/10 text-primary grid size-9 place-items-center rounded-full text-sm font-semibold',
        )}
        data-testid="profile-menu"
      >
        {initials || <UserRound aria-hidden="true" className="size-4" />}
      </button>
      {open ? (
        <div
          role="menu"
          className="bg-card shadow-raised absolute right-0 z-50 mt-2 w-60 rounded-md border border-border p-1"
        >
          <div className="border-b border-border px-3 py-2">
            <p className="truncate text-sm font-medium">{name}</p>
            <p className="type-meta truncate">{email}</p>
          </div>
          <Link
            role="menuitem"
            href="/app/settings"
            onClick={() => {
              setOpen(false);
            }}
            className="hover:bg-muted flex items-center gap-2 rounded-sm px-3 py-2 text-sm"
          >
            <Settings aria-hidden="true" className="size-4" />
            {t('settings')}
          </Link>
          <button
            role="menuitem"
            type="button"
            className="hover:bg-muted flex w-full items-center gap-2 rounded-sm px-3 py-2 text-sm"
            data-testid="sign-out"
            onClick={() => {
              void (async () => {
                setOpen(false);
                await signOut();
                router.replace('/');
              })();
            }}
          >
            <LogOut aria-hidden="true" className="size-4" />
            {t('signOut')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Authenticated layout: guard, role-aware navigation, top bar, real-time connection. */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations('appNav');
  const { state } = useSession();
  const router = useRouter();
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const user = state.status === 'authenticated' ? state.user : null;
  const needsOnboarding = user !== null && (user.role === null || !user.profileComplete);

  useEffect(() => {
    if (state.status === 'anonymous')
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    else if (needsOnboarding) router.replace('/onboarding');
  }, [state.status, needsOnboarding, router, pathname]);

  const unread = useQuery({
    queryKey: keys.unread,
    queryFn: api.unread,
    enabled: user !== null && !needsOnboarding,
  });

  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-md space-y-3 p-10" role="alert">
        <p className="font-semibold">{t('offlineTitle')}</p>
        <p className="type-meta">{t('offlineBody')}</p>
        <Button
          variant="outline"
          onClick={() => {
            window.location.reload();
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (user?.role == null || needsOnboarding) {
    return (
      <div
        className="grid min-h-dvh md:grid-cols-[16rem_1fr]"
        role="status"
        aria-label={t('loading')}
      >
        <div className="hidden border-r border-border p-4 md:block">
          <Skeleton className="h-full w-full" />
        </div>
        <div className="space-y-4 p-6">
          <Skeleton className="h-10 w-1/3" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  const role = user.role;
  return (
    <RealtimeProvider>
      <a
        href="#main"
        className="bg-primary text-primary-foreground sr-only z-50 rounded-md px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        {t('skip')}
      </a>
      <div className="grid min-h-dvh md:grid-cols-[16rem_1fr]">
        <aside className="bg-card sticky top-0 hidden h-dvh flex-col gap-6 border-r border-border p-4 md:flex">
          <Link href="/" className="px-3 pt-1">
            <Logo />
          </Link>
          <SidebarNav role={role} unread={unread.data} />
          <p className="type-meta mt-auto px-3">{t(`roleLabel.${role}`)}</p>
        </aside>
        <div className="flex min-w-0 flex-col">
          <header className="bg-background/85 sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border px-4 backdrop-blur sm:px-6">
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label={t('openMenu')}
                  data-testid="mobile-menu"
                >
                  <Menu aria-hidden="true" />
                </Button>
              </SheetTrigger>
              <SheetContent>
                <SheetHeader>
                  <SheetTitle>
                    <Logo />
                  </SheetTitle>
                  <SheetDescription className="sr-only">{t('label')}</SheetDescription>
                </SheetHeader>
                <div className="mt-2">
                  <SidebarNav
                    role={role}
                    unread={unread.data}
                    onNavigate={() => {
                      setMenuOpen(false);
                    }}
                  />
                </div>
              </SheetContent>
            </Sheet>
            <Link href="/" className="md:hidden">
              <Logo />
            </Link>
            <div className="ml-auto flex items-center gap-1">
              <Link
                href="/app/notifications"
                aria-label={t('notificationsLabel', { count: unread.data?.notifications ?? 0 })}
                className={cn(
                  focusRing,
                  'hover:bg-muted relative grid size-10 place-items-center rounded-sm',
                )}
                data-testid="topbar-notifications"
              >
                <Bell aria-hidden="true" className="size-4" />
                {(unread.data?.notifications ?? 0) > 0 ? (
                  <span
                    className="bg-primary absolute top-2 right-2 size-2 rounded-full"
                    aria-hidden="true"
                  />
                ) : null}
              </Link>
              <ThemeToggle />
              <ProfileMenu name={user.name} email={user.email} />
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
            {children}
          </main>
        </div>
      </div>
    </RealtimeProvider>
  );
}

/** Renders children only for the given roles; otherwise a forbidden state (the API also refuses). */
export function RoleGate({ roles, children }: { roles: UserRole[]; children: ReactNode }) {
  const t = useTranslations('appNav');
  const { state } = useSession();
  if (state.status !== 'authenticated' || state.user.role === null) return null;
  if (!roles.includes(state.user.role)) {
    return (
      <div className="space-y-2" role="alert">
        <h1 className="type-h1">{t('forbiddenTitle')}</h1>
        <p className="text-muted-foreground">{t('forbiddenBody')}</p>
        <Link href="/app" className="text-primary font-medium">
          {t('backToDashboard')}
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}
