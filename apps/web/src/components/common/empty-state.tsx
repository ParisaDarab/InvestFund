import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

export interface EmptyStateProps {
  icon?: LucideIcon;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border px-6 py-12 text-center',
        className,
      )}
      data-testid="empty-state"
    >
      {Icon === undefined ? null : (
        <span className="bg-muted text-muted-foreground grid size-11 place-items-center rounded-full">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      )}
      <p className="font-semibold">{title}</p>
      {description === undefined ? null : <p className="type-meta max-w-md">{description}</p>}
      {action === undefined ? null : <div className="mt-2">{action}</div>}
    </div>
  );
}
