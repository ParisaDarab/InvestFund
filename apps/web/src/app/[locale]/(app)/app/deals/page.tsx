import { Suspense } from 'react';

import { ListSkeleton } from '@/components/common/query-states';
import { RoleGate } from '@/components/shell/app-shell';
import { DealsPage } from '@/features/deals/deals-page';

export default function Page() {
  return (
    <RoleGate roles={['founder', 'supporter']}>
      <Suspense fallback={<ListSkeleton />}>
        <DealsPage />
      </Suspense>
    </RoleGate>
  );
}
