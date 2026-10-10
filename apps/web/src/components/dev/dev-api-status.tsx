import { ApiStatusBadge } from './api-status-badge';

import { buildApiUrl } from '@/lib/api/client';
import { isDevUiEnabled } from '@/lib/dev-ui';

/**
 * Server Component wrapper for the API status badge: rendered in `next dev`, left out of
 * production builds (unless `INVESTFUND_DEV_UI=true`, as for the other dev aids, so the P0 smoke
 * can check it). It also shows that the API client is importable from Server Components.
 */
export function DevApiStatus() {
  const enabled = isDevUiEnabled({
    NODE_ENV: process.env.NODE_ENV,
    INVESTFUND_DEV_UI: process.env.INVESTFUND_DEV_UI,
  });
  if (!enabled) return null;

  const { host } = new URL(buildApiUrl('/health/ready', { prefix: false }));
  return <ApiStatusBadge apiHost={host} />;
}
