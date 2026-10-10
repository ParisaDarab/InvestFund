'use client';

import * as ToastPrimitive from '@radix-ui/react-toast';
import { X } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { buttonVariants } from './button-variants';
import { focusRing } from './focus-ring';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export const ToastProvider = ToastPrimitive.Provider;

export function ToastViewport({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Viewport>) {
  const t = useTranslations('ui');
  return (
    <ToastPrimitive.Viewport
      // Radix replaces the literal {hotkey} placeholder with the focus shortcut (F8).
      label={t('notifications', { hotkey: '{hotkey}' })}
      className={cn(
        'fixed right-0 bottom-0 z-[100] flex max-h-dvh w-full flex-col gap-2 p-4 outline-none sm:max-w-sm',
        className,
      )}
      {...props}
    />
  );
}

export const toastVariantClasses = {
  default: 'border-border',
  destructive: 'border-destructive',
} as const;

export type ToastVariant = keyof typeof toastVariantClasses;

export interface ToastProps extends ComponentProps<typeof ToastPrimitive.Root> {
  variant?: ToastVariant;
}

export function Toast({ className, variant = 'default', ...props }: ToastProps) {
  return (
    <ToastPrimitive.Root
      className={cn(
        'bg-card text-card-foreground relative flex w-full items-start gap-3 rounded-md border p-4 pr-10 shadow-lg data-[state=open]:animate-slide-in-up data-[state=closed]:animate-fade-out data-[swipe=end]:animate-slide-out-right data-[swipe=move]:translate-x-(--radix-toast-swipe-move-x)',
        toastVariantClasses[variant],
        className,
      )}
      data-variant={variant}
      {...props}
    />
  );
}

export function ToastTitle({ className, ...props }: ComponentProps<typeof ToastPrimitive.Title>) {
  return <ToastPrimitive.Title className={cn('text-sm font-semibold', className)} {...props} />;
}

export function ToastDescription({
  className,
  ...props
}: ComponentProps<typeof ToastPrimitive.Description>) {
  return <ToastPrimitive.Description className={cn('type-meta', className)} {...props} />;
}

export function ToastAction({ className, ...props }: ComponentProps<typeof ToastPrimitive.Action>) {
  return (
    <ToastPrimitive.Action
      className={buttonVariants({ variant: 'outline', size: 'sm', className })}
      {...props}
    />
  );
}

export function ToastClose({ className, ...props }: ComponentProps<typeof ToastPrimitive.Close>) {
  const t = useTranslations('ui');
  return (
    <ToastPrimitive.Close
      className={cn(
        'text-muted-foreground hover:text-foreground absolute top-3 right-3 cursor-pointer rounded-sm p-1',
        focusRing,
        className,
      )}
      aria-label={t('close')}
      {...props}
    >
      <X aria-hidden="true" className="size-4" />
    </ToastPrimitive.Close>
  );
}
