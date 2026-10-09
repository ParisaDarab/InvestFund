import { focusRing } from './focus-ring';

import { cn } from '@/lib/cn';

export const buttonVariantClasses = {
  primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
  secondary: 'bg-muted text-foreground hover:bg-muted/80',
  outline: 'border border-border bg-transparent text-foreground hover:bg-muted',
  ghost: 'bg-transparent text-foreground hover:bg-muted',
  // The label uses the page background colour, which passes 4.5:1 on --destructive in both themes.
  destructive: 'bg-destructive text-background hover:bg-destructive/90',
} as const;

export const buttonSizeClasses = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-12 px-6 text-base',
  icon: 'size-10',
} as const;

export type ButtonVariant = keyof typeof buttonVariantClasses;
export type ButtonSize = keyof typeof buttonSizeClasses;

export interface ButtonVariantOptions {
  variant?: ButtonVariant | undefined;
  size?: ButtonSize | undefined;
  className?: string | undefined;
}

const buttonBase =
  'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-sm font-medium whitespace-nowrap transition-colors duration-150 ease-out disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0';

/**
 * Class names for a button. Kept out of the (client) Button module so that Server Components can
 * style a `Link` as a button without a client boundary.
 */
export function buttonVariants({
  variant = 'primary',
  size = 'md',
  className,
}: ButtonVariantOptions = {}): string {
  return cn(
    buttonBase,
    focusRing,
    buttonVariantClasses[variant],
    buttonSizeClasses[size],
    className,
  );
}
