/**
 * Validated runtime configuration. This is the ONLY place that reads `process.env`.
 *
 * `loadConfig()` fails fast with a `ConfigError` that lists the offending variable NAMES and
 * the kind of problem. It never echoes values, so secrets cannot leak into logs or terminals.
 * Later cards extend `EnvSchema` with their own variables (Redis, LLM, Google...).
 */
import { isIP } from 'node:net';
import { resolve } from 'node:path';

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

/** A PostgreSQL connection URL (`postgresql://` or `postgres://`). */
const postgresUrl = z.url({ protocol: /^postgres(ql)?$/ });

/** Secret placeholders from `.env.example` that must never reach production. */
const PLACEHOLDER_SECRETS = new Set(['change-me', 'changeme']);

/** Minimum length of HMAC secrets in production (256 bits of base64url text is 43 chars). */
export const MIN_PRODUCTION_SECRET_LENGTH = 32;

/** AES-256 key length in bytes. */
export const ENCRYPTION_KEY_BYTES = 32;

/**
 * The development-only `ENCRYPTION_KEY` from `.env.example` (base64 of
 * `dev-only-key-not-for-production!`). Valid so a fresh checkout boots; rejected in production.
 */
export const DEV_PLACEHOLDER_ENCRYPTION_KEY = 'ZGV2LW9ubHkta2V5LW5vdC1mb3ItcHJvZHVjdGlvbiE=';

/** Key versions are stored in `*_key_version smallint` columns. */
const keyVersion = z.coerce.number().int().min(1).max(32_767);

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Standard base64 that decodes to exactly 32 bytes (an AES-256 key). */
const encryptionKey = z
  .string()
  .trim()
  .refine((value) => BASE64.test(value), { message: 'invalid' })
  .transform((value) => Buffer.from(value, 'base64'))
  .refine((key) => key.length === ENCRYPTION_KEY_BYTES, { message: 'invalid' });

/**
 * Retired keys still needed to decrypt old rows: `"<version>:<base64 key>"` entries separated by
 * commas, for example `1:AAAA...=,2:BBBB...=`. Versions must be unique.
 */
const previousEncryptionKeys = z
  .string()
  .trim()
  .transform((value, ctx) => {
    const keys = new Map<number, Buffer>();
    for (const entry of value.split(',')) {
      const separator = entry.indexOf(':');
      const version = keyVersion.safeParse(entry.slice(0, separator).trim());
      const key = encryptionKey.safeParse(entry.slice(separator + 1));
      if (separator === -1 || !version.success || !key.success || keys.has(version.data)) {
        ctx.addIssue({ code: 'custom', message: 'invalid' });
        return z.NEVER;
      }
      keys.set(version.data, key.data);
    }
    return keys;
  });

/** Keywords Express accepts as `trust proxy` subnets. */
const TRUST_PROXY_KEYWORDS = new Set(['loopback', 'linklocal', 'uniquelocal']);

function isAddressOrSubnet(value: string): boolean {
  if (TRUST_PROXY_KEYWORDS.has(value)) return true;
  const [address = '', prefix, ...rest] = value.split('/');
  if (rest.length > 0) return false;
  const family = isIP(address);
  if (family === 0) return false;
  if (prefix === undefined) return true;
  if (!/^\d{1,3}$/.test(prefix)) return false;
  return Number(prefix) <= (family === 4 ? 32 : 128);
}

/**
 * Express `trust proxy`: `false` (default: use the socket address), a hop count (`1` behind one
 * reverse proxy), or a comma-separated list of proxy addresses/CIDRs and the keywords `loopback`,
 * `linklocal`, `uniquelocal`. `true` is rejected: trusting every hop lets any client choose its IP
 * through `X-Forwarded-For` and so bypass the per-IP rate limits.
 */
const trustProxy = z
  .string()
  .trim()
  .transform((value, ctx): TrustProxySetting => {
    const lower = value.toLowerCase();
    if (lower === 'false' || lower === '0') return false;
    if (/^\d{1,2}$/.test(lower)) return Number(lower);
    const entries = lower.split(',').map((entry) => entry.trim());
    if (entries.every(isAddressOrSubnet)) return entries;
    ctx.addIssue({ code: 'custom', message: 'invalid' });
    return z.NEVER;
  });

export type TrustProxySetting = false | number | readonly string[];

/** An `http(s)` URL reduced to its origin (`scheme://host[:port]`), as browsers send `Origin`. */
const webOrigin = z.url({ protocol: /^https?$/ }).transform((value) => new URL(value).origin);

export const RATE_LIMIT_STORES = ['postgres', 'memory'] as const;

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
    /** PostgreSQL connection URL used by Prisma (`core/db`). Required at boot. Contains a secret. */
    DATABASE_URL: postgresUrl,
    /** Signs access tokens (HS256, verified by `core/auth`). Required at boot. */
    JWT_ACCESS_SECRET: z.string().min(1),
    /** Origin of the web app: the only CORS origin allowed (with credentials). Required in production. */
    WEB_URL: webOrigin.optional(),
    /** Express `trust proxy` (see `trustProxy`). Defaults to `false`. */
    TRUST_PROXY: trustProxy.optional(),
    /** Current AES-256-GCM key (base64, 32 bytes) for secrets at rest (`core/crypto`). Required. */
    ENCRYPTION_KEY: encryptionKey,
    /** Version stored next to ciphertext encrypted with `ENCRYPTION_KEY`. */
    ENCRYPTION_KEY_VERSION: keyVersion.default(1),
    /** Retired keys kept for decryption only: `"<version>:<base64>,..."`. */
    ENCRYPTION_PREVIOUS_KEYS: previousEncryptionKeys.optional(),
    /** HMAC-SHA256 key for IP hashes (`ip_hash` columns, rate-limit keys). Required at boot. */
    IP_HASH_SECRET: z.string().min(1),
    /** Root directory of the local-disk storage provider. Relative paths resolve against the cwd. */
    STORAGE_DIR: z.string().trim().min(1).default('./storage'),
    /** Largest accepted upload, in MB (docs/API.md §2: 25 MB). */
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(1024).default(25),
    /** Rate-limit counter store. `memory` is for tests and single-process development only. */
    RATE_LIMIT_STORE: z.enum(RATE_LIMIT_STORES).default('postgres'),
  })
  .superRefine((env, ctx) => {
    if (env.ENCRYPTION_PREVIOUS_KEYS?.has(env.ENCRYPTION_KEY_VERSION) === true) {
      // The current version must not also appear as a previous key.
      ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_PREVIOUS_KEYS'], message: 'invalid' });
    }
    if (env.NODE_ENV !== 'production') return;
    for (const name of ['JWT_ACCESS_SECRET', 'IP_HASH_SECRET'] as const) {
      const secret = env[name];
      if (
        secret.length < MIN_PRODUCTION_SECRET_LENGTH ||
        PLACEHOLDER_SECRETS.has(secret.toLowerCase())
      ) {
        ctx.addIssue({ code: 'custom', path: [name], message: 'weak' });
      }
    }
    const placeholderKey = Buffer.from(DEV_PLACEHOLDER_ENCRYPTION_KEY, 'base64');
    if (env.ENCRYPTION_KEY.equals(placeholderKey)) {
      ctx.addIssue({ code: 'custom', path: ['ENCRYPTION_KEY'], message: 'weak' });
    }
    if (env.WEB_URL === undefined) {
      ctx.addIssue({ code: 'custom', path: ['WEB_URL'], message: 'required' });
    }
    if (env.RATE_LIMIT_STORE === 'memory') {
      // Counters must be shared by every API process in production.
      ctx.addIssue({ code: 'custom', path: ['RATE_LIMIT_STORE'], message: 'invalid' });
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
  readonly database: { readonly url: string };
  readonly auth: { readonly jwtAccessSecret: string };
  readonly security: {
    /** Origins allowed by CORS (with credentials): the web app only. */
    readonly corsOrigins: readonly string[];
    readonly trustProxy: TrustProxySetting;
    /** Send `Strict-Transport-Security` (production only; never on local HTTP). */
    readonly hsts: boolean;
  };
  readonly crypto: {
    readonly currentKeyVersion: number;
    /** Every usable key by version: the current one plus the previous ones. */
    readonly keys: ReadonlyMap<number, Buffer>;
    readonly ipHashSecret: string;
  };
  readonly storage: { readonly dir: string; readonly maxUploadBytes: number };
  readonly rateLimit: { readonly store: (typeof RATE_LIMIT_STORES)[number] };
}

/** Default `WEB_URL` outside production (the Next.js dev server). */
export const DEFAULT_WEB_ORIGIN = 'http://localhost:3000';

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
  const names = Object.keys(EnvSchema.shape) as (keyof typeof EnvSchema.shape)[];
  const raw: Record<string, string> = {};
  for (const key of names) {
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
  const keys = new Map(env.ENCRYPTION_PREVIOUS_KEYS);
  keys.set(env.ENCRYPTION_KEY_VERSION, env.ENCRYPTION_KEY);
  return {
    env: env.NODE_ENV,
    isProduction,
    http: { host: env.API_HOST, port: env.API_PORT },
    log: { level: env.LOG_LEVEL ?? (env.NODE_ENV === 'test' ? 'silent' : 'info') },
    metrics: { enabled: env.METRICS_ENABLED, host: env.METRICS_HOST, port: env.METRICS_PORT },
    openApi: { public: env.OPENAPI_PUBLIC ?? !isProduction },
    shutdown: { timeoutMs: env.SHUTDOWN_TIMEOUT_MS },
    database: { url: env.DATABASE_URL },
    auth: { jwtAccessSecret: env.JWT_ACCESS_SECRET },
    security: {
      corsOrigins: [env.WEB_URL ?? DEFAULT_WEB_ORIGIN],
      trustProxy: env.TRUST_PROXY ?? false,
      hsts: isProduction,
    },
    crypto: {
      currentKeyVersion: env.ENCRYPTION_KEY_VERSION,
      keys,
      ipHashSecret: env.IP_HASH_SECRET,
    },
    storage: { dir: resolve(env.STORAGE_DIR), maxUploadBytes: env.MAX_UPLOAD_MB * 1024 * 1024 },
    rateLimit: { store: env.RATE_LIMIT_STORE },
  };
}
