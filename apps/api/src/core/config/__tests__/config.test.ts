import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ConfigError, DEV_PLACEHOLDER_ENCRYPTION_KEY, loadConfig } from '../config.js';

const SECRET = 'unit-test-secret-value';
const DATABASE_URL = 'postgresql://user:db-password-zz@localhost:5432/investfund';
/** Synthetic 32-byte keys (base64), test-only. */
const KEY_A = Buffer.alloc(32, 1).toString('base64');
const KEY_B = Buffer.alloc(32, 2).toString('base64');
const KEY_C = Buffer.alloc(32, 3).toString('base64');
const IP_SECRET = 'unit-test-ip-secret';
/** The minimal valid environment: the required variables. */
const REQUIRED = {
  JWT_ACCESS_SECRET: SECRET,
  DATABASE_URL,
  ENCRYPTION_KEY: KEY_A,
  IP_HASH_SECRET: IP_SECRET,
  JWT_REFRESH_SECRET: 'unit-test-refresh-secret',
} as const;
/** A valid production environment (strong secrets, explicit WEB_URL). */
const PRODUCTION = {
  ...REQUIRED,
  NODE_ENV: 'production',
  JWT_ACCESS_SECRET: 'x'.repeat(48),
  IP_HASH_SECRET: 'y'.repeat(48),
  JWT_REFRESH_SECRET: 'z'.repeat(48),
  WEB_URL: 'https://app.investfund.test',
} as const;

/** `env` without `name` (to test a missing variable). */
function without(env: Record<string, string>, name: string): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => key !== name));
}

function expectConfigError(env: Record<string, string>): ConfigError {
  try {
    loadConfig(env);
  } catch (error) {
    expect(error).toBeInstanceOf(ConfigError);
    return error as ConfigError;
  }
  throw new Error('expected loadConfig to throw');
}

describe('loadConfig', () => {
  it('applies defaults for a minimal valid environment', () => {
    const config = loadConfig(REQUIRED);
    expect(config).toEqual({
      env: 'development',
      isProduction: false,
      http: { host: '127.0.0.1', port: 4000 },
      log: { level: 'info' },
      metrics: { enabled: true, host: '127.0.0.1', port: 9464 },
      openApi: { public: true },
      shutdown: { timeoutMs: 8000 },
      database: { url: DATABASE_URL },
      auth: { jwtAccessSecret: SECRET },
      security: { corsOrigins: ['http://localhost:3000'], trustProxy: false, hsts: false },
      crypto: {
        currentKeyVersion: 1,
        keys: new Map([[1, Buffer.from(KEY_A, 'base64')]]),
        ipHashSecret: IP_SECRET,
      },
      storage: { dir: resolve('./storage'), maxUploadBytes: 25 * 1024 * 1024 },
      rateLimit: { store: 'postgres', authPerMinute: 10 },
      session: { stateSecret: 'unit-test-refresh-secret', refreshTtlDays: 30 },
      google: null,
      webOrigin: 'http://localhost:3000',
      email: {
        delivery: 'log',
        dispatcherEnabled: true,
        from: 'InvestFund <no-reply@investfund.local>',
        smtp: null,
      },
      realtime: { bus: 'postgres' },
    });
  });

  it('enables Google sign-in only when the client id, secret and redirect URI are all set', () => {
    expect(loadConfig({ ...REQUIRED, GOOGLE_CLIENT_ID: 'id' }).google).toBeNull();
    const config = loadConfig({
      ...REQUIRED,
      GOOGLE_CLIENT_ID: 'id',
      GOOGLE_CLIENT_SECRET: 'secret',
      GOOGLE_REDIRECT_URI: 'http://localhost:4000/api/v1/auth/google/callback',
      GOOGLE_AUTH_BASE_URL: 'http://localhost:4020/',
    });
    expect(config.google).toMatchObject({
      clientId: 'id',
      authBaseUrl: 'http://localhost:4020',
      oauth2BaseUrl: 'https://oauth2.googleapis.com',
    });
  });

  it('requires SMTP_HOST when EMAIL_DELIVERY is smtp', () => {
    expect(expectConfigError({ ...REQUIRED, EMAIL_DELIVERY: 'smtp' }).issues).toEqual([
      { variable: 'SMTP_HOST', problem: 'missing' },
    ]);
  });

  it('rejects a weak JWT_REFRESH_SECRET in production', () => {
    expect(expectConfigError({ ...PRODUCTION, JWT_REFRESH_SECRET: 'change-me' }).issues).toEqual([
      { variable: 'JWT_REFRESH_SECRET', problem: 'weak' },
    ]);
  });

  it('parses explicit values', () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      API_HOST: '0.0.0.0',
      API_PORT: '4100',
      LOG_LEVEL: 'warn',
      METRICS_ENABLED: 'FALSE',
      METRICS_PORT: '9000',
      OPENAPI_PUBLIC: '0',
      SHUTDOWN_TIMEOUT_MS: '500',
      ...REQUIRED,
    });
    expect(config.http).toEqual({ host: '0.0.0.0', port: 4100 });
    expect(config.log.level).toBe('warn');
    expect(config.metrics).toEqual({ enabled: false, host: '127.0.0.1', port: 9000 });
    expect(config.openApi.public).toBe(false);
    expect(config.shutdown.timeoutMs).toBe(500);
  });

  it('defaults the log level to silent in tests', () => {
    expect(loadConfig({ NODE_ENV: 'test', ...REQUIRED }).log.level).toBe('silent');
  });

  it('keeps OpenAPI private by default in production', () => {
    expect(loadConfig(PRODUCTION).openApi.public).toBe(false);
    expect(loadConfig({ ...PRODUCTION, OPENAPI_PUBLIC: 'true' }).openApi.public).toBe(true);
  });

  it('reports a missing JWT_ACCESS_SECRET by name', () => {
    const error = expectConfigError({
      ...without(REQUIRED, 'JWT_ACCESS_SECRET'),
      API_PORT: '4000',
    });
    expect(error.issues).toEqual([{ variable: 'JWT_ACCESS_SECRET', problem: 'missing' }]);
    expect(error.message).toContain('JWT_ACCESS_SECRET');
  });

  it('treats an empty string as missing', () => {
    expect(expectConfigError({ ...REQUIRED, JWT_ACCESS_SECRET: '' }).issues).toEqual([
      { variable: 'JWT_ACCESS_SECRET', problem: 'missing' },
    ]);
  });

  it('reports malformed values by name without echoing them', () => {
    const error = expectConfigError({
      ...REQUIRED,
      API_PORT: 'not-a-port-zz',
      METRICS_ENABLED: 'maybe-yy',
      NODE_ENV: 'staging-xx',
    });
    expect(error.issues).toEqual(
      expect.arrayContaining([
        { variable: 'API_PORT', problem: 'invalid' },
        { variable: 'METRICS_ENABLED', problem: 'invalid' },
        { variable: 'NODE_ENV', problem: 'invalid' },
      ]),
    );
    for (const value of ['not-a-port-zz', 'maybe-yy', 'staging-xx', SECRET, 'db-password-zz']) {
      expect(error.message).not.toContain(value);
    }
  });

  it('rejects out-of-range ports', () => {
    expect(expectConfigError({ ...REQUIRED, API_PORT: '70000' }).issues).toEqual([
      { variable: 'API_PORT', problem: 'invalid' },
    ]);
  });

  it('rejects weak or placeholder secrets in production only', () => {
    for (const name of ['JWT_ACCESS_SECRET', 'IP_HASH_SECRET']) {
      for (const secret of ['change-me', 'short-secret']) {
        const error = expectConfigError({ ...PRODUCTION, [name]: secret });
        expect(error.issues).toEqual([{ variable: name, problem: 'weak' }]);
        expect(error.message).not.toContain(secret);
      }
    }
    const dev = loadConfig({
      ...REQUIRED,
      NODE_ENV: 'development',
      JWT_ACCESS_SECRET: 'change-me',
      IP_HASH_SECRET: 'change-me',
    });
    expect(dev.auth.jwtAccessSecret).toBe('change-me');
    expect(dev.crypto.ipHashSecret).toBe('change-me');
  });

  it('reports a missing DATABASE_URL by name', () => {
    expect(expectConfigError(without(REQUIRED, 'DATABASE_URL')).issues).toEqual([
      { variable: 'DATABASE_URL', problem: 'missing' },
    ]);
  });

  it.each([
    ['a non-PostgreSQL scheme', 'mysql://user:db-password-zz@localhost:3306/investfund'],
    ['a malformed URL', 'not a url db-password-zz'],
  ])('rejects %s as DATABASE_URL without echoing it', (_label, url) => {
    const error = expectConfigError({ ...REQUIRED, DATABASE_URL: url });
    expect(error.issues).toEqual([{ variable: 'DATABASE_URL', problem: 'invalid' }]);
    expect(error.message).not.toContain('db-password-zz');
  });

  it('accepts the postgres:// scheme', () => {
    const url = 'postgres://user:pw@db.internal:5432/investfund?schema=public';
    expect(loadConfig({ ...REQUIRED, DATABASE_URL: url }).database.url).toBe(url);
  });

  it('ignores unrelated variables', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, SOMETHING_ELSE: 'whatever', PATH: '/usr/bin' }),
    ).not.toThrow();
  });
});

describe('loadConfig: crypto keys (P0-API-02)', () => {
  it('reports a missing ENCRYPTION_KEY and IP_HASH_SECRET by name', () => {
    const error = expectConfigError({ JWT_ACCESS_SECRET: SECRET, DATABASE_URL });
    expect(error.issues).toEqual(
      expect.arrayContaining([
        { variable: 'ENCRYPTION_KEY', problem: 'missing' },
        { variable: 'IP_HASH_SECRET', problem: 'missing' },
      ]),
    );
  });

  it.each([
    ['not base64', 'change-me'],
    ['16 bytes', Buffer.alloc(16, 9).toString('base64')],
    ['33 bytes', Buffer.alloc(33, 9).toString('base64')],
  ])('rejects an ENCRYPTION_KEY that is %s without echoing it', (_label, key) => {
    const error = expectConfigError({ ...REQUIRED, ENCRYPTION_KEY: key });
    expect(error.issues).toEqual([{ variable: 'ENCRYPTION_KEY', problem: 'invalid' }]);
    expect(error.message).not.toContain(key);
  });

  it('builds the key ring from the current and previous keys', () => {
    const config = loadConfig({
      ...REQUIRED,
      ENCRYPTION_KEY: KEY_C,
      ENCRYPTION_KEY_VERSION: '3',
      ENCRYPTION_PREVIOUS_KEYS: `1:${KEY_A}, 2:${KEY_B}`,
    });
    expect(config.crypto.currentKeyVersion).toBe(3);
    expect([...config.crypto.keys.keys()].sort()).toEqual([1, 2, 3]);
    expect(config.crypto.keys.get(2)?.equals(Buffer.from(KEY_B, 'base64'))).toBe(true);
  });

  it.each([
    ['a duplicate version', `1:${KEY_A},1:${KEY_B}`],
    ['the current version', `1:${KEY_B}`],
    ['a missing separator', KEY_B],
    ['a version out of range', `40000:${KEY_B}`],
    ['a short key', `2:${Buffer.alloc(8).toString('base64')}`],
  ])('rejects ENCRYPTION_PREVIOUS_KEYS with %s without echoing keys', (_label, value) => {
    const error = expectConfigError({ ...REQUIRED, ENCRYPTION_PREVIOUS_KEYS: value });
    expect(error.issues).toEqual([{ variable: 'ENCRYPTION_PREVIOUS_KEYS', problem: 'invalid' }]);
    expect(error.message).not.toContain(KEY_B);
  });

  it('rejects ENCRYPTION_KEY_VERSION outside smallint range', () => {
    for (const version of ['0', '32768', 'v1']) {
      expect(expectConfigError({ ...REQUIRED, ENCRYPTION_KEY_VERSION: version }).issues).toEqual([
        { variable: 'ENCRYPTION_KEY_VERSION', problem: 'invalid' },
      ]);
    }
  });

  it('accepts the .env.example placeholder key in development but not in production', () => {
    const dev = { ...REQUIRED, ENCRYPTION_KEY: DEV_PLACEHOLDER_ENCRYPTION_KEY };
    expect(loadConfig(dev).crypto.keys.get(1)?.length).toBe(32);
    const error = expectConfigError({
      ...PRODUCTION,
      ENCRYPTION_KEY: DEV_PLACEHOLDER_ENCRYPTION_KEY,
    });
    expect(error.issues).toEqual([{ variable: 'ENCRYPTION_KEY', problem: 'weak' }]);
  });
});

describe('loadConfig: HTTP security settings (P0-API-02)', () => {
  it('reduces WEB_URL to its origin for CORS', () => {
    expect(
      loadConfig({ ...REQUIRED, WEB_URL: 'https://app.example.test:8443/some/path?q=1' }).security
        .corsOrigins,
    ).toEqual(['https://app.example.test:8443']);
  });

  it.each(['ftp://app.example.test', 'not a url'])('rejects WEB_URL %s', (url) => {
    expect(expectConfigError({ ...REQUIRED, WEB_URL: url }).issues).toEqual([
      { variable: 'WEB_URL', problem: 'invalid' },
    ]);
  });

  it('requires WEB_URL in production and enables HSTS there', () => {
    expect(expectConfigError(without(PRODUCTION, 'WEB_URL')).issues).toEqual([
      { variable: 'WEB_URL', problem: 'missing' },
    ]);
    const config = loadConfig(PRODUCTION);
    expect(config.security).toEqual({
      corsOrigins: ['https://app.investfund.test'],
      trustProxy: false,
      hsts: true,
    });
  });

  it.each([
    ['false', false],
    ['0', false],
    ['1', 1],
    ['loopback', ['loopback']],
    ['10.0.0.0/8, 192.168.1.10, fd00::/8', ['10.0.0.0/8', '192.168.1.10', 'fd00::/8']],
  ])('parses TRUST_PROXY=%s', (value, expected) => {
    expect(loadConfig({ ...REQUIRED, TRUST_PROXY: value }).security.trustProxy).toEqual(expected);
  });

  it.each(['true', 'yes', '10.0.0.0/33', '300', 'example.com'])(
    'rejects TRUST_PROXY=%s (trusting every hop lets clients spoof their IP)',
    (value) => {
      expect(expectConfigError({ ...REQUIRED, TRUST_PROXY: value }).issues).toEqual([
        { variable: 'TRUST_PROXY', problem: 'invalid' },
      ]);
    },
  );

  it('parses storage and rate-limit settings', () => {
    const config = loadConfig({
      ...REQUIRED,
      STORAGE_DIR: '/var/lib/investfund/files',
      MAX_UPLOAD_MB: '10',
      RATE_LIMIT_STORE: 'memory',
    });
    expect(config.storage).toEqual({
      dir: '/var/lib/investfund/files',
      maxUploadBytes: 10 * 1024 * 1024,
    });
    expect(config.rateLimit.store).toBe('memory');
  });

  it('refuses the in-memory rate-limit store in production', () => {
    expect(expectConfigError({ ...PRODUCTION, RATE_LIMIT_STORE: 'memory' }).issues).toEqual([
      { variable: 'RATE_LIMIT_STORE', problem: 'invalid' },
    ]);
  });

  it.each(['0', '2000', 'big'])('rejects MAX_UPLOAD_MB=%s', (value) => {
    expect(expectConfigError({ ...REQUIRED, MAX_UPLOAD_MB: value }).issues).toEqual([
      { variable: 'MAX_UPLOAD_MB', problem: 'invalid' },
    ]);
  });
});
