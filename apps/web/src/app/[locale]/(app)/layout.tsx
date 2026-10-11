import type { ReactNode } from 'react';

import { DevApiStatus } from '@/components/dev/dev-api-status';
import { AppShell } from '@/components/shell/app-shell';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AppShell>{children}</AppShell>
      <DevApiStatus />
    </>
  );
}
