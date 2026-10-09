/**
 * System endpoint contracts (docs/API.md §5): `GET /health/live` and `GET /health/ready`.
 *
 * Health bodies are public, so they name checks and report pass/fail only. They never carry
 * error messages, hostnames, versions or other internal details.
 */
import { z } from 'zod';

/** Outcome of a health check, and of the report as a whole. */
export const HealthStatus = z.enum(['ok', 'fail']).meta({ id: 'HealthStatus' });
export type HealthStatus = z.infer<typeof HealthStatus>;

/** One readiness check, for example `db`, `redis` or `storage`. */
export const HealthCheck = z
  .object({
    name: z.string().min(1).meta({ example: 'db' }),
    status: HealthStatus,
  })
  .meta({ id: 'HealthCheck' });
export type HealthCheck = z.infer<typeof HealthCheck>;

/**
 * Body of `GET /health/ready`: `200` when every check is `ok`, otherwise `503` with `status`
 * `fail` and the failing checks marked `fail`.
 */
export const HealthReport = z
  .object({
    status: HealthStatus,
    checks: z.array(HealthCheck),
  })
  .meta({
    id: 'HealthReport',
    description: 'Readiness of the API and its dependencies. Public, so deliberately minimal.',
  });
export type HealthReport = z.infer<typeof HealthReport>;

/** Body of `GET /health/live`: the process is up. */
export const HealthLive = z
  .object({
    status: z.literal('ok'),
  })
  .meta({ id: 'HealthLive' });
export type HealthLive = z.infer<typeof HealthLive>;
