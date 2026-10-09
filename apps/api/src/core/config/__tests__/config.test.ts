import { describe, expect, it } from 'vitest';

import { ConfigError, loadConfig } from '../config.js';

const SECRET = 'unit-test-secret-value';
const DATABASE_URL = 'postgresql://user:db-password-zz@localhost:5432/investfund';
/** The minimal valid environment: the two required variables. */
const REQUIRED = { JWT_ACCESS_SECRET: SECRET, DATABASE_URL } as const;

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
    });
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
    const secret = 'x'.repeat(48);
    expect(
      loadConfig({ NODE_ENV: 'production', DATABASE_URL, JWT_ACCESS_SECRET: secret }).openApi
        .public,
    ).toBe(false);
    expect(
      loadConfig({
        NODE_ENV: 'production',
        OPENAPI_PUBLIC: 'true',
        DATABASE_URL,
        JWT_ACCESS_SECRET: secret,
      }).openApi.public,
    ).toBe(true);
  });

  it('reports a missing JWT_ACCESS_SECRET by name', () => {
    const error = expectConfigError({ API_PORT: '4000', DATABASE_URL });
    expect(error.issues).toEqual([{ variable: 'JWT_ACCESS_SECRET', problem: 'missing' }]);
    expect(error.message).toContain('JWT_ACCESS_SECRET');
  });

  it('treats an empty string as missing', () => {
    expect(expectConfigError({ JWT_ACCESS_SECRET: '', DATABASE_URL }).issues).toEqual([
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
    for (const secret of ['change-me', 'short-secret']) {
      const error = expectConfigError({
        NODE_ENV: 'production',
        DATABASE_URL,
        JWT_ACCESS_SECRET: secret,
      });
      expect(error.issues).toEqual([{ variable: 'JWT_ACCESS_SECRET', problem: 'weak' }]);
      expect(error.message).not.toContain(secret);
    }
    expect(
      loadConfig({ NODE_ENV: 'development', DATABASE_URL, JWT_ACCESS_SECRET: 'change-me' }).auth
        .jwtAccessSecret,
    ).toBe('change-me');
  });

  it('reports a missing DATABASE_URL by name', () => {
    expect(expectConfigError({ JWT_ACCESS_SECRET: SECRET }).issues).toEqual([
      { variable: 'DATABASE_URL', problem: 'missing' },
    ]);
  });

  it.each([
    ['a non-PostgreSQL scheme', 'mysql://user:db-password-zz@localhost:3306/investfund'],
    ['a malformed URL', 'not a url db-password-zz'],
  ])('rejects %s as DATABASE_URL without echoing it', (_label, url) => {
    const error = expectConfigError({ JWT_ACCESS_SECRET: SECRET, DATABASE_URL: url });
    expect(error.issues).toEqual([{ variable: 'DATABASE_URL', problem: 'invalid' }]);
    expect(error.message).not.toContain('db-password-zz');
  });

  it('accepts the postgres:// scheme', () => {
    const url = 'postgres://user:pw@db.internal:5432/investfund?schema=public';
    expect(loadConfig({ JWT_ACCESS_SECRET: SECRET, DATABASE_URL: url }).database.url).toBe(url);
  });

  it('ignores unrelated variables', () => {
    expect(() =>
      loadConfig({ ...REQUIRED, SOMETHING_ELSE: 'whatever', PATH: '/usr/bin' }),
    ).not.toThrow();
  });
});
