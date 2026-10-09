import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Loading placeholder. Decorative: announce the loading state with text or `aria-busy`. */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden="true"
      className={cn('bg-muted animate-pulse rounded-sm', className)}
      data-testid="skeleton"
      {...props}
    />
  );
}
