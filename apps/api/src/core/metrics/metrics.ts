/**
 * Prometheus metrics (prom-client): process defaults plus an HTTP request duration histogram.
 *
 * `/metrics` is NOT mounted on the public app. It is served by a separate listener
 * (`METRICS_HOST:METRICS_PORT`, default 127.0.0.1:9464) that must never be published or routed
 * publicly, or disabled with `METRICS_ENABLED=false`.
 */
import express, { type Express, type RequestHandler, type Response } from 'express';
import { collectDefaultMetrics, Histogram, Registry } from 'prom-client';

/** Label used when no route matched, to keep label cardinality bounded. */
export const UNMATCHED_ROUTE = '<unmatched>';

export const HTTP_DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/** `res.locals` key holding the mount path captured by `captureMountPath`. */
const MOUNT_PATH_LOCAL = 'metricsMountPath';

/**
 * Records `req.baseUrl` while the request is inside a mounted router. Express restores
 * `req.baseUrl` when an error leaves that router, so by the time `finish` fires the mount path
 * of a throwing route is lost; the captured value keeps the route label complete.
 * `createApp` places it before the health router and before each module router.
 */
export const captureMountPath: RequestHandler = (req, res, next) => {
  (res.locals as Record<string, unknown>)[MOUNT_PATH_LOCAL] = req.baseUrl;
  next();
};

function mountPathOf(res: Response, fallback: string): string {
  const captured = (res.locals as Record<string, unknown>)[MOUNT_PATH_LOCAL];
  return typeof captured === 'string' ? captured : fallback;
}

export interface HttpMetrics {
  readonly registry: Registry;
  /** Records `http_request_duration_seconds{method,route,status_code}` for every request. */
  readonly middleware: RequestHandler;
}

export function createHttpMetrics(options: { collectDefaults?: boolean } = {}): HttpMetrics {
  const registry = new Registry();
  if (options.collectDefaults ?? true) collectDefaultMetrics({ register: registry });

  const duration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'] as const,
    buckets: HTTP_DURATION_BUCKETS,
    registers: [registry],
  });

  const middleware: RequestHandler = (req, res, next) => {
    const end = duration.startTimer();
    res.once('finish', () => {
      // The route template (`/health/ready`, later `/startups/:startupId`), never the raw URL.
      const routePath: unknown = (req.route as { path?: unknown } | undefined)?.path;
      const route =
        typeof routePath === 'string'
          ? `${mountPathOf(res, req.baseUrl)}${routePath}`
          : UNMATCHED_ROUTE;
      end({ method: req.method, route, status_code: String(res.statusCode) });
    });
    next();
  };

  return { registry, middleware };
}

/** The internal metrics app: `GET /metrics` only. */
export function createMetricsApp(registry: Registry): Express {
  const app = express();
  app.disable('x-powered-by');
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', registry.contentType).send(await registry.metrics());
  });
  app.use((_req, res) => {
    res.status(404).end();
  });
  return app;
}
