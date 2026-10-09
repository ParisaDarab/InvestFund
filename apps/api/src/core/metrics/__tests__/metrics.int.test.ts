import { Router } from 'express';
import request from 'supertest';
import { describe, expect, it } from 'vitest';

import { captureLogs } from '../../../__tests__/support.js';
import { createApp } from '../../../app.js';
import { ReadinessRegistry } from '../../health/health-registry.js';
import { asyncHandler } from '../../http/async-handler.js';
import { createLogger } from '../../logger/logger.js';
import { createHttpMetrics, createMetricsApp, UNMATCHED_ROUTE } from '../metrics.js';

function setup() {
  const logger = createLogger({ level: 'silent' }, captureLogs().stream);
  const metrics = createHttpMetrics({ collectDefaults: false });
  const router = Router();
  router.get('/:itemId', (_req, res) => {
    res.json({ ok: true });
  });
  router.get('/:itemId/fail', () => {
    throw new Error('boom');
  });
  router.get(
    '/:itemId/fail-async',
    asyncHandler(async () => {
      await Promise.resolve();
      throw new Error('boom');
    }),
  );
  const app = createApp({
    logger,
    readiness: new ReadinessRegistry(logger),
    metrics,
    modules: [{ path: '/items', router }],
  });
  return { app, metrics };
}

describe('HTTP metrics', () => {
  it('records durations labelled by route template, not raw URL', async () => {
    const { app, metrics } = setup();
    await request(app).get('/health/live');
    await request(app).get('/api/v1/items/0192-secret-id');
    await request(app).get('/api/v1/nope');

    const text = await metrics.registry.metrics();
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/health/live",status_code="200"} 1',
    );
    expect(text).toContain('route="/api/v1/items/:itemId",status_code="200"} 1');
    expect(text).toContain(`route="${UNMATCHED_ROUTE}",status_code="404"} 1`);
    expect(text).not.toContain('0192-secret-id');
  });

  it('keeps the full route template when a mounted module route throws', async () => {
    const { app, metrics } = setup();
    expect((await request(app).get('/api/v1/items/0192-secret-id/fail')).status).toBe(500);
    expect((await request(app).get('/api/v1/items/0192-secret-id/fail-async')).status).toBe(500);

    const text = await metrics.registry.metrics();
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/v1/items/:itemId/fail",status_code="500"} 1',
    );
    expect(text).toContain(
      'http_request_duration_seconds_count{method="GET",route="/api/v1/items/:itemId/fail-async",status_code="500"} 1',
    );
    expect(text).not.toContain('route="/:itemId');
    expect(text).not.toContain('0192-secret-id');
  });

  it('is not exposed on the public app', async () => {
    const { app } = setup();
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(404);
  });

  it('is served by the internal metrics app, including default metrics', async () => {
    const metrics = createHttpMetrics();
    const internal = createMetricsApp(metrics.registry);

    const res = await request(internal).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/plain/);
    expect(res.text).toContain('process_cpu_user_seconds_total');
    expect(res.text).toContain('# TYPE http_request_duration_seconds histogram');

    expect((await request(internal).get('/other')).status).toBe(404);
  });
});
