import { ChevronDown } from 'lucide-react';

import { focusRing } from './focus-ring';
import { fieldClasses } from './input';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/** A styled native `<select>`: fully accessible and reliable on mobile. */
export function NativeSelect({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <div className="relative">
      <select
        className={cn(fieldClasses, focusRing, 'h-10 appearance-none px-3 pr-9 text-sm', className)}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2"
      />
    </div>
  );
}
