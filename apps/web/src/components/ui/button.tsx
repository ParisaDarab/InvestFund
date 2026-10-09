'use client';

import { Slot } from '@radix-ui/react-slot';

import { buttonVariants } from './button-variants';

import type { ButtonVariantOptions } from './button-variants';
import type { ComponentProps } from 'react';

export interface ButtonProps
  extends ComponentProps<'button'>, Omit<ButtonVariantOptions, 'className'> {
  /** Render the single child (for example a `Link`) with the button styles instead of a <button>. */
  asChild?: boolean;
}

export function Button({
  variant = 'primary',
  size,
  asChild = false,
  className,
  type,
  ...props
}: ButtonProps) {
  const classes = buttonVariants({ variant, size, className });
  if (asChild) return <Slot className={classes} data-variant={variant} {...props} />;
  return <button type={type ?? 'button'} className={classes} data-variant={variant} {...props} />;
}
