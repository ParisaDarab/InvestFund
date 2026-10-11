'use client';

import { Check } from 'lucide-react';

import { focusRing } from '@/components/ui/focus-ring';
import { cn } from '@/lib/cn';

export interface ChipGroupProps<Value extends string> {
  legend: string;
  hint?: string;
  options: readonly Value[];
  value: readonly Value[];
  onChange: (next: Value[]) => void;
  label: (value: Value) => string;
  /** Test id prefix for each chip. */
  name: string;
}

/** Multi-select as toggle buttons (`aria-pressed`), grouped in a fieldset. */
export function ChipGroup<Value extends string>({
  legend,
  hint,
  options,
  value,
  onChange,
  label,
  name,
}: ChipGroupProps<Value>) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{legend}</legend>
      {hint === undefined ? null : <p className="type-meta">{hint}</p>}
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const selected = value.includes(option);
          return (
            <button
              key={option}
              type="button"
              aria-pressed={selected}
              data-testid={`${name}-${option}`}
              onClick={() => {
                onChange(selected ? value.filter((v) => v !== option) : [...value, option]);
              }}
              className={cn(
                focusRing,
                'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors',
                selected
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border hover:bg-muted',
              )}
            >
              {selected ? <Check aria-hidden="true" className="size-3.5" /> : null}
              {label(option)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
