/**
 * Validated runtime configuration. This is the ONLY place that reads `process.env`.
 *
 * `loadConfig()` fails fast with a `ConfigError` that lists the offending variable NAMES and
 * the kind of problem. It never echoes values, so secrets cannot leak into logs or terminals.
 * Later cards extend `EnvSchema` with their own variables (database, Redis, crypto, storage...).
 */
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

/** Parses `"true" | "false" | "1" | "0"` (case-insensitive). Anything else is invalid. */
const booleanFlag = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.enum(['true', 'false', '1', '0']))
  .transform((value) => value === 'true' || value === '1');

const port = z.coerce.number().int().min(0).max(65_535);

const host = z.string().trim().min(1);

/** Secret placeholders from `.env.example` that must never reach production. */
const PLACEHOLDER_SECRETS = new Set(['change-me', 'changeme']);

/** Minimum length of HMAC secrets in production (256 bits of base64url text is 43 chars). */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

export const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    API_HOST: host.default('127.0.0.1'),
    API_PORT: port.default(4000),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
    /** Expose `GET /metrics` on the internal metrics listener. */
    METRICS_ENABLED: booleanFlag.default(true),
    /** Interface of the internal metrics listener. Never publish this port. */
    METRICS_HOST: host.default('127.0.0.1'),
    METRICS_PORT: port.default(9464),
    /** Serve `GET /api/v1/openapi.json`. Defaults to on, except in production. */
    OPENAPI_PUBLIC: booleanFlag.optional(),
    /** Grace period for in-flight requests on SIGTERM/SIGINT before connections are cut. */
    SHUTDOWN_TIMEOUT_MS: z.coerce.number().int().min(100).max(60_000).default(8000),
    /** Signs access tokens (verified by `core/auth`, P0-API-02). Required at boot. */
    JWT_ACCESS_SECRET: z.string().min(1),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    const secret = env.JWT_ACCESS_SECRET;
    if (
      secret.length < MIN_PRODUCTION_SECRET_LENGTH ||
      PLACEHOLDER_SECRETS.has(secret.toLowerCase())
    ) {
      ctx.addIssue({ code: 'custom', path: ['JWT_ACCESS_SECRET'], message: 'weak' });
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export interface AppConfig {
  readonly env: Env['NODE_ENV'];
  readonly isProduction: boolean;
  readonly http: { readonly host: string; readonly port: number };
  readonly log: { readonly level: (typeof LOG_LEVELS)[number] };
  readonly metrics: { readonly enabled: boolean; readonly host: string; readonly port: number };
  readonly openApi: { readonly public: boolean };
  readonly shutdown: { readonly timeoutMs: number };
  readonly auth: { readonly jwtAccessSecret: string };
}

export type ConfigProblem = 'missing' | 'invalid' | 'weak';

export interface ConfigIssue {
  readonly variable: string;
  readonly problem: ConfigProblem;
}

/** Raised when the environment is invalid. The message contains variable names only. */
export class ConfigError extends Error {
  override readonly name = 'ConfigError';

  constructor(readonly issues: readonly ConfigIssue[]) {
    super(
      `Invalid environment configuration: ${issues
        .map((issue) => `${issue.variable} (${issue.problem})`)
        .join(', ')}`,
    );
  }
}

type RawEnv = Readonly<Record<string, string | undefined>>;

/**
 * Validates `source` (default `process.env`) and returns the typed configuration.
 * Empty strings count as unset, so `JWT_ACCESS_SECRET=` in a `.env` file is reported as missing.
 */
export function loadConfig(source: RawEnv = process.env): AppConfig {
  const keys = Object.keys(EnvSchema.shape) as (keyof typeof EnvSchema.shape)[];
  const raw: Record<string, string> = {};
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== '') raw[key] = value;
  }

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = new Map<string, ConfigProblem>();
    for (const issue of parsed.error.issues) {
      const variable = String(issue.path[0] ?? '(root)');
      if (issues.has(variable)) continue;
      const problem: ConfigProblem =
        raw[variable] === undefined ? 'missing' : issue.message === 'weak' ? 'weak' : 'invalid';
      issues.set(variable, problem);
    }
    throw new ConfigError([...issues].map(([variable, problem]) => ({ variable, problem })));
  }

  const env = parsed.data;
  const isProduction = env.NODE_ENV === 'production';
  return {
    env: env.NODE_ENV,
    isProduction,
    http: { host: env.API_HOST, port: env.API_PORT },
    log: { level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info') },
    metrics: { enabled: env.METRICS_ENABLED, host: env.METRICS_HOST, port: env.METRICS_PORT },
    openApi: { public: env.OPENAPI_PUBLIC ?? !isProduction },
    shutdown: { timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
    auth: { jwtAccessSecret: env.JWT_ACCESS_SECRET },
  };
}
