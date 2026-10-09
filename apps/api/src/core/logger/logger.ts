/**
 * Structured logging with pino.
 *
 * Sensitive keys are redacted wherever they appear in the first three levels of a log object
 * (`password`, `body.password`, `req.headers.authorization` ...). Request and response
 * serializers are minimal on purpose: no query strings, bodies or headers are ever logged.
 */
import {
  pino,
  stdSerializers,
  type DestinationStream,
  type Logger,
  type LoggerOptions,
} from 'pino';

export type { Logger };

/** Keys whose values are always replaced by `[Redacted]`. */
export const SENSITIVE_KEYS = [
  'authorization',
  'cookie',
  'set-cookie',
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'apiKey',
  'secret',
] as const;

export const REDACTED = '[Redacted]';

/** Redaction paths: each sensitive key at depth 0, 1 and 2 (for example `req.headers.cookie`). */
export const REDACT_PATHS: readonly string[] = SENSITIVE_KEYS.flatMap((key) => {
  const isIdentifier = /^[A-Za-z_$][\w$]*$/.test(key);
  const root = isIdentifier ? key : `["${key}"]`;
  const nested = isIdentifier ? `.${key}` : `["${key}"]`;
  return [root, `*${nested}`, `*.*${nested}`];
});

export interface LoggerConfig {
  readonly level: LoggerOptions['level'];
  readonly service?: string;
}

/**
 * Creates the root logger. Pass `destination` to capture output (tests); the default is stdout.
 * Lines are JSON with an ISO timestamp, the level as a label and the `service` name.
 */
export function createLogger(config: LoggerConfig, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level: config.level ?? 'info',
    base: { service: config.service ?? 'api' },
    timestamp: pino.stdTimeFunctions.isoTime,
    formatters: { level: (label) => ({ level: label }) },
    redact: { paths: [...REDACT_PATHS], censor: REDACTED },
    serializers: { err: stdSerializers.err },
  };
  return destination === undefined ? pino(options) : pino(options, destination);
}
