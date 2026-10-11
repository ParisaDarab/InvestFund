import type { ReactNode } from 'react';

import { Label } from '@/components/ui/label';

export interface FieldProps {
  id: string;
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  optional?: string | undefined;
  children: ReactNode;
}

/** Label, control, hint and error with the ARIA wiring done by the caller via ids. */
export function Field({ id, label, hint, error, optional, children }: FieldProps) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id}>
        {label}
        {optional === undefined ? null : (
          <span className="type-meta ml-1 font-normal">({optional})</span>
        )}
      </Label>
      {children}
      {hint === undefined ? null : (
        <p id={`${id}-hint`} className="type-meta">
          {hint}
        </p>
      )}
      {error === undefined ? null : (
        <p id={`${id}-error`} className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** ARIA props for a control rendered inside `Field`. */
export function describedBy(id: string, hint?: string, error?: string) {
  const ids = [
    hint === undefined ? null : `${id}-hint`,
    error === undefined ? null : `${id}-error`,
  ].filter(Boolean);
  return {
    id,
    'aria-invalid': error === undefined ? undefined : true,
    'aria-describedby': ids.length === 0 ? undefined : ids.join(' '),
  };
}
