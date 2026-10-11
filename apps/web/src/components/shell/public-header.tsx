'use client';

import { Menu } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Link } from '@/i18n/navigation';
import { useSession } from '@/lib/auth/session';

const LINKS = [
  { href: '/discover', key: 'discover' },
  { href: '/how-it-works', key: 'howItWorks' },
  { href: '/#founders', key: 'founders' },
  { href: '/#supporters', key: 'supporters' },
] as const;

export function PublicHeader() {
  const t = useTranslations('publicNav');
  const { state } = useSession();
  const signedIn = state.status === 'authenticated';
  const cta = signedIn ? (
    <Link href="/app" className={buttonVariants({ size: 'sm' })} data-testid="nav-dashboard">
      {t('dashboard')}
    </Link>
  ) : (
    <Link href="/login" className={buttonVariants({ size: 'sm' })} data-testid="nav-sign-in">
      {t('signIn')}
    </Link>
  );
  return (
    <header className="bg-background/85 sticky top-0 z-40 border-b border-border backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link href="/" aria-label={t('home')}>
          <Logo />
        </Link>
        <nav aria-label={t('label')} className="hidden items-center gap-5 text-sm md:flex">
          {LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className="text-muted-foreground hover:text-foreground"
            >
              {t(link.key)}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <div className="hidden sm:block">{cta}</div>
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden" aria-label={t('openMenu')}>
                <Menu aria-hidden="true" />
              </Button>
            </SheetTrigger>
            <SheetContent>
              <SheetHeader>
                <SheetTitle>{t('menu')}</SheetTitle>
                <SheetDescription className="sr-only">{t('menuDescription')}</SheetDescription>
              </SheetHeader>
              <nav aria-label={t('label')} className="mt-6 flex flex-col gap-4 px-6">
                {LINKS.map((link) => (
                  <Link key={link.key} href={link.href} className="text-base font-medium">
                    {t(link.key)}
                  </Link>
                ))}
                <div className="pt-2">{cta}</div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
