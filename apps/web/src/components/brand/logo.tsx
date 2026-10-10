import { useTranslations } from 'next-intl';

import { cn } from '@/lib/cn';

export interface LogoProps {
  className?: string;
}

/**
 * Placeholder wordmark (docs/DESIGN_SYSTEM.md, Brand): the product name in Inter Bold followed by
 * an accent-coloured dot. Replace when a real logo exists. Works in Server and Client Components.
 */
export function Logo({ className }: LogoProps) {
  const t = useTranslations('metadata');
  return (
    <span
      className={cn('inline-flex items-baseline text-xl font-bold tracking-tight', className)}
      data-testid="logo"
    >
      {t('siteName')}
      <span aria-hidden="true" className="text-primary">
        .
      </span>
    </span>
  );
}
