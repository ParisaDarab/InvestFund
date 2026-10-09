import { z } from 'zod';

import { parseRfc3339 } from './time.js';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(4020),
  /** Loopback by default; the Docker image sets 0.0.0.0. */
  HOST: z.string().min(1).default('127.0.0.1'),
  /** Start of the mock clock. Each created message, event or token advances it by one second. */
  MOCK_NOW: z
    .string()
    .refine((value) => parseRfc3339(value) !== null, 'MOCK_NOW must be an RFC 3339 date-time')
    .default('2026-01-05T08:00:00Z'),
  /** When set, `/o/oauth2/v2/auth` and `/token` accept only this client ID. Any ID otherwise. */
  MOCK_GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  /** When set, `/token` accepts only this client secret. Any secret otherwise. */
  MOCK_GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  /** Keep sent and injected message bodies in `/__calls`. Off by default. */
  MOCK_RECORD_CONTENT: booleanString.default(false),
});

export interface MockGoogleConfig {
  port: number;
  host: string;
  startTime: number;
  clientId: string | null;
  clientSecret: string | null;
  recordContent: boolean;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): MockGoogleConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    startTime: parseRfc3339(parsed.MOCK_NOW) ?? 0,
    clientId: parsed.MOCK_GOOGLE_CLIENT_ID ?? null,
    clientSecret: parsed.MOCK_GOOGLE_CLIENT_SECRET ?? null,
    recordContent: parsed.MOCK_RECORD_CONTENT,
  };
}
