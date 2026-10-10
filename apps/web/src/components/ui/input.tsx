import { focusRing } from './focus-ring';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** Shared look of text fields (Input, Textarea, Select trigger). */
export const fieldClasses =
  'w-full rounded-sm border border-border bg-background text-foreground placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <input
      type={type ?? 'text'}
      className={cn(fieldClasses, focusRing, 'h-10 px-3 text-sm', className)}
      {...props}
    />
  );
}
