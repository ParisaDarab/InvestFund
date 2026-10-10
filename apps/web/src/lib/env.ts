import { z } from 'zod';

/**
 * Public (browser-exposed) environment variables. Everything here is inlined into the client
 * bundle at build time, so it must never contain secrets.
 */
const publicEnvSchema = z.object({
  NEXT_PUBLIC_API_URL: z.url({
    protocol: /^https?$/,
    error: 'must be an absolute http(s) URL, for example http://localhost:4000',
  }),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export class EnvValidationError extends Error {
  override readonly name = 'EnvValidationError';
}

/**
 * Validates the public environment. Throws an {@link EnvValidationError} whose message names
 * every missing or invalid variable, so a failing `next build` points straight at the cause.
 */
export function parsePublicEnv(source: Record<string, string | undefined>): PublicEnv {
  const result = publicEnvSchema.safeParse({
    NEXT_PUBLIC_API_URL: emptyToUndefined(source.NEXT_PUBLIC_API_URL),
  });
  if (result.success) return result.data;

  const problems = result.error.issues.map((issue) => {
    const name = issue.path.join('.');
    const reason = issue.code === 'invalid_type' ? 'is required but missing' : issue.message;
    return `  - ${name} ${reason}`;
  });
  throw new EnvValidationError(
    `Invalid environment variables for @investfund/web:\n${problems.join('\n')}\n` +
      'Set them in apps/web/.env.local or the process environment (see .env.example).',
  );
}

function emptyToUndefined(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === '' ? undefined : value;
}

let cached: PublicEnv | undefined;

/**
 * Lazily validated public env for application code. `process.env.NEXT_PUBLIC_*` must be read
 * with literal property access so that Next.js can inline the values into the client bundle.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parsePublicEnv({ NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL });
  return cached;
}
