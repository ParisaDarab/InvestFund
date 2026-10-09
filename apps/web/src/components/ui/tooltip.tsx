'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Tooltip with its own provider, so it works anywhere without app-level setup. */
export function Tooltip({
  delayDuration = 200,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Root> & { delayDuration?: number }) {
  return (
    <TooltipPrimitive.Provider delayDuration={delayDuration}>
      <TooltipPrimitive.Root {...props} />
    </TooltipPrimitive.Provider>
  );
}

export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          // Inverted colours: foreground on background is the highest-contrast token pair.
          'bg-foreground text-background z-50 max-w-xs rounded-sm px-3 py-1.5 text-xs data-[state=closed]:animate-fade-out data-[state=delayed-open]:animate-fade-in data-[state=instant-open]:animate-fade-in',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
