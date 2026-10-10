import { focusRing } from './focus-ring';
import { fieldClasses } from './input';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      className={cn(fieldClasses, focusRing, 'min-h-24 px-3 py-2 text-sm', className)}
      {...props}
    />
  );
}
