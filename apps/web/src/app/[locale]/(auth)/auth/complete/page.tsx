import { Suspense } from 'react';

import { AuthComplete } from '@/features/auth/auth-complete';

export default function AuthCompletePage() {
  return (
    <Suspense>
      <AuthComplete />
    </Suspense>
  );
}
