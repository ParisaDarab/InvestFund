import type { ReactNode } from 'react';

import { PublicFooter } from '@/components/shell/public-footer';
import { PublicHeader } from '@/components/shell/public-header';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <div className="flex-1">{children}</div>
      <PublicFooter />
    </div>
  );
}
