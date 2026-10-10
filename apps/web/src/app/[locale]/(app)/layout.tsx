import type { ReactNode } from 'react';

import { DevApiStatus } from '@/components/dev/dev-api-status';

interface AppLayoutProps {
  children: ReactNode;
}

// App shell placeholder. Navigation, role-aware layout and route guards arrive in Phase 1.
export default function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      {children}
      <DevApiStatus />
    </>
  );
}
