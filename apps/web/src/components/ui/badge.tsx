import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

const badgeBase =
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap';

export const badgeVariantClasses = {
  default: 'border-border bg-muted text-foreground',
  primary: 'border-primary/40 bg-transparent text-primary',
  outline: 'border-border bg-transparent text-muted-foreground',
} as const;

export type BadgeVariant = keyof typeof badgeVariantClasses;

export interface BadgeProps extends ComponentProps<'span'> {
  variant?: BadgeVariant;
}

export function Badge({ variant = 'default', className, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeBase, badgeVariantClasses[variant], className)}
      data-variant={variant}
      {...props}
    />
  );
}

/**
 * Status tones. The text is the status token on a transparent background, so the pill sits on the
 * page or card background; those pairs are contrast-checked in both themes.
 */
export const statusToneClasses = {
  neutral: 'border-border text-muted-foreground',
  info: 'border-primary/40 text-primary',
  success: 'border-success/40 text-success',
  warning: 'border-warning/40 text-warning',
  danger: 'border-destructive/40 text-destructive',
} as const;

export type StatusTone = keyof typeof statusToneClasses;

export interface StatusPillProps extends ComponentProps<'span'> {
  tone?: StatusTone;
}

/** A status label with a leading dot. The meaning is carried by the text, never by colour alone. */
export function StatusPill({ tone = 'neutral', className, children, ...props }: StatusPillProps) {
  return (
    <span
      className={cn(badgeBase, 'bg-transparent', statusToneClasses[tone], className)}
      data-tone={tone}
      {...props}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
