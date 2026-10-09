'use client';

import type { ErrorStateProps } from '@/components/feedback/error-state';

import { ErrorState } from '@/components/feedback/error-state';

export default function MarketingError(props: ErrorStateProps) {
  return <ErrorState {...props} />;
}
