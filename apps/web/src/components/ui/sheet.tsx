'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';

import { DialogCornerClose, DialogOverlay, DialogPortal } from './dialog';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** A dialog that slides in from the right edge (navigation drawers, detail panels). */
export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;

export function SheetContent({
  className,
  children,
  ...props
}: ComponentProps<typeof DialogPrimitive.Content>) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        className={cn(
          'bg-card text-card-foreground fixed inset-y-0 right-0 z-50 flex h-full w-3/4 max-w-sm flex-col gap-4 border-l border-border p-6 shadow-lg data-[state=open]:animate-slide-in-right data-[state=closed]:animate-slide-out-right',
          className,
        )}
        {...props}
      >
        {children}
        <DialogCornerClose />
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

export function SheetHeader({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('flex flex-col gap-1.5 pr-6', className)} {...props} />;
}

export function SheetTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
  return <DialogPrimitive.Title className={cn('type-h3', className)} {...props} />;
}

export function SheetDescription({
  className,
  ...props
}: ComponentProps<typeof DialogPrimitive.Description>) {
  return <DialogPrimitive.Description className={cn('type-meta', className)} {...props} />;
}
