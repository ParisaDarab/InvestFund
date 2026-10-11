import { useTranslations } from 'next-intl';

import { Logo } from '@/components/brand/logo';
import { Link } from '@/i18n/navigation';

export function PublicFooter() {
  const t = useTranslations('footer');
  return (
    <footer className="border-t border-border">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[2fr_1fr_1fr]">
        <div className="space-y-3">
          <Logo />
          <p className="type-meta max-w-sm">{t('tagline')}</p>
          <p className="type-meta max-w-md">{t('disclaimer')}</p>
        </div>
        <nav aria-label={t('productLabel')} className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">{t('product')}</p>
          <Link href="/discover" className="text-muted-foreground hover:text-foreground">
            {t('discover')}
          </Link>
          <Link href="/how-it-works" className="text-muted-foreground hover:text-foreground">
            {t('howItWorks')}
          </Link>
          <Link href="/login" className="text-muted-foreground hover:text-foreground">
            {t('signIn')}
          </Link>
        </nav>
        <nav aria-label={t('legalLabel')} className="flex flex-col gap-2 text-sm">
          <p className="font-semibold">{t('legal')}</p>
          <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
            {t('privacy')}
          </Link>
          <Link href="/terms" className="text-muted-foreground hover:text-foreground">
            {t('terms')}
          </Link>
        </nav>
      </div>
    </footer>
  );
}
