import { z } from 'zod';

/**
 * Body of `POST /__control`: a failure-injection rule for the next `next` matching calls.
 * Exactly one outcome (`fail`, `malformedJson` or `timeout`) or a pure `latencyMs` delay.
 * Rules queue up (FIFO): each `/v1/*` call consumes one unit of the first rule whose `path`
 * prefix matches it.
 */
export const ControlRuleInput = z
  .strictObject({
    next: z.int().min(1).max(1000).default(1),
    fail: z.union([z.literal(429), z.literal(500), z.literal(503)]).optional(),
    /** `retry-after` seconds sent with a 429 or 503. */
    retryAfter: z.int().min(0).max(3600).default(1),
    latencyMs: z.int().min(0).max(120_000).optional(),
    malformedJson: z.literal(true).optional(),
    timeout: z.literal(true).optional(),
    /** Only calls whose path starts with this prefix (e.g. `/v1/embeddings`) consume the rule. */
    path: z.string().startsWith('/').optional(),
  })
  .refine(
    (rule) =>
      [rule.fail !== undefined, rule.malformedJson === true, rule.timeout === true].filter(Boolean)
        .length <= 1,
    { message: 'Use at most one of fail, malformedJson and timeout per rule' },
  )
  .refine(
    (rule) =>
      rule.fail !== undefined ||
      rule.malformedJson === true ||
      rule.timeout === true ||
      rule.latencyMs !== undefined,
    { message: 'A rule needs fail, malformedJson, timeout or latencyMs' },
  );
export type ControlRuleInput = z.input<typeof ControlRuleInput>;

export interface ControlEffect {
  fail?: 429 | 500 | 503;
  retryAfter: number;
  latencyMs?: number;
  malformedJson?: true;
  timeout?: true;
}

interface ControlRule extends ControlEffect {
  remaining: number;
  path?: string;
}

export function describeEffect(effect: ControlEffect): string | null {
  if (effect.fail !== undefined) return String(effect.fail);
  if (effect.malformedJson === true) return 'malformedJson';
  if (effect.timeout === true) return 'timeout';
  if (effect.latencyMs !== undefined) return `latency:${String(effect.latencyMs)}ms`;
  return null;
}

export class ControlState {
  #rules: ControlRule[] = [];

  add(input: unknown): z.output<typeof ControlRuleInput> {
    const parsed = ControlRuleInput.parse(input);
    const rule: ControlRule = { remaining: parsed.next, retryAfter: parsed.retryAfter };
    if (parsed.fail !== undefined) rule.fail = parsed.fail;
    if (parsed.latencyMs !== undefined) rule.latencyMs = parsed.latencyMs;
    if (parsed.malformedJson !== undefined) rule.malformedJson = parsed.malformedJson;
    if (parsed.timeout !== undefined) rule.timeout = parsed.timeout;
    if (parsed.path !== undefined) rule.path = parsed.path;
    this.#rules.push(rule);
    return parsed;
  }

  /** Consumes one unit of the first matching rule and returns its effect, if any. */
  take(path: string): ControlEffect | undefined {
    const index = this.#rules.findIndex(
      (rule) => rule.path === undefined || path.startsWith(rule.path),
    );
    const rule = this.#rules[index];
    if (rule === undefined) return undefined;
    rule.remaining -= 1;
    if (rule.remaining === 0) this.#rules.splice(index, 1);
    const effect: ControlEffect = { retryAfter: rule.retryAfter };
    if (rule.fail !== undefined) effect.fail = rule.fail;
    if (rule.latencyMs !== undefined) effect.latencyMs = rule.latencyMs;
    if (rule.malformedJson !== undefined) effect.malformedJson = rule.malformedJson;
    if (rule.timeout !== undefined) effect.timeout = rule.timeout;
    return effect;
  }

  pending(): { remaining: number; path: string | null; effect: string | null }[] {
    return this.#rules.map((rule) => ({
      remaining: rule.remaining,
      path: rule.path ?? null,
      effect: describeEffect(rule),
    }));
  }

  clear(): void {
    this.#rules = [];
  }
}
