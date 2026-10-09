import { fileURLToPath } from 'node:url';

import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const modelDimensions = z.string().transform((value, ctx) => {
  const map: Record<string, number> = {};
  for (const pair of value.split(',').map((item) => item.trim())) {
    if (pair === '') continue;
    const match = /^([^=\s]+)=([1-9]\d{0,3})$/.exec(pair);
    if (match?.[1] === undefined || match[2] === undefined) {
      ctx.addIssue({ code: 'custom', message: `Expected model=dimension, got "${pair}"` });
      return z.NEVER;
    }
    map[match[1]] = Number(match[2]);
  }
  return map;
});

const modelList = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(0).max(65_535).default(4010),
  /** Loopback by default; the Docker image sets 0.0.0.0. */
  HOST: z.string().min(1).default('127.0.0.1'),
  MOCK_FIXTURES_DIR: z
    .string()
    .min(1)
    .default(fileURLToPath(new URL('../fixtures', import.meta.url))),
  MOCK_EMBEDDING_DIM: z.coerce.number().int().min(1).max(8192).default(1536),
  /** Per-model dimensions, e.g. `mock-embedding-small=384,mock-embedding-large=3072`. */
  MOCK_EMBEDDING_MODELS: modelDimensions.default({}),
  MOCK_CHAT_MODELS: modelList.default(['mock-chat']),
  /** Keep request and response content in `/__calls`. Off by default. */
  MOCK_RECORD_CONTENT: booleanString.default(false),
  /** How long a `timeout`-injected request is held open before the socket is destroyed. */
  MOCK_TIMEOUT_HOLD_MS: z.coerce.number().int().min(1).max(600_000).default(120_000),
});

export interface MockLlmConfig {
  port: number;
  host: string;
  fixturesDir: string;
  embeddingDimensions: number;
  embeddingModels: Record<string, number>;
  chatModels: string[];
  recordContent: boolean;
  timeoutHoldMs: number;
}

export function loadConfig(env: Readonly<Record<string, string | undefined>>): MockLlmConfig {
  const parsed = EnvSchema.parse(env);
  return {
    port: parsed.PORT,
    host: parsed.HOST,
    fixturesDir: parsed.MOCK_FIXTURES_DIR,
    embeddingDimensions: parsed.MOCK_EMBEDDING_DIM,
    embeddingModels: parsed.MOCK_EMBEDDING_MODELS,
    chatModels: parsed.MOCK_CHAT_MODELS,
    recordContent: parsed.MOCK_RECORD_CONTENT,
    timeoutHoldMs: parsed.MOCK_TIMEOUT_HOLD_MS,
  };
}
