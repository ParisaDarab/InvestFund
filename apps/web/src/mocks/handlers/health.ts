import { http, HttpResponse } from 'msw';

import type { HealthReport } from '@investfund/shared';

import { buildApiUrl } from '@/lib/api/client';

/** `GET /health/ready` lives at the API root, outside `/api/v1`. */
export const healthReadyUrl = () => buildApiUrl('/health/ready', { prefix: false });

export const readyHealthReport: HealthReport = {
  status: 'ok',
  checks: [
    { name: 'db', status: 'ok' },
    { name: 'storage', status: 'ok' },
  ],
};

export const notReadyHealthReport: HealthReport = {
  status: 'fail',
  checks: [
    { name: 'db', status: 'fail' },
    { name: 'storage', status: 'ok' },
  ],
};

/** Handler answering `GET /health/ready` with `report` (503 when it reports `fail`, as the API does). */
export function healthReadyHandler(report: HealthReport = readyHealthReport) {
  return http.get(healthReadyUrl(), () =>
    HttpResponse.json(report, {
      status: report.status === 'ok' ? 200 : 503,
      headers: { 'Cache-Control': 'no-store', 'X-Request-Id': 'msw-health' },
    }),
  );
}

export const healthHandlers = [healthReadyHandler()];
