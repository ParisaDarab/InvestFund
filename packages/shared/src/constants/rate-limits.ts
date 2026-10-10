/**
 * Rate-limit preset names (docs/API.md §3). The limits themselves are configured in the API
 * (`core/rateLimit`); clients only need the names, for example to label 429 responses.
 */
export const RATE_LIMIT_PRESETS = ['auth', 'upload', 'ai', 'sensitive', 'default'] as const;

export type RateLimitPreset = (typeof RATE_LIMIT_PRESETS)[number];
