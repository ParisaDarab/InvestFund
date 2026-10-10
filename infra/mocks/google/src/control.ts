import { z } from 'zod';

/**
 * Body of `POST /__control`: a failure-injection rule for the next `next` matching calls.
 * Rules queue up (FIFO): each recorded call consumes one unit of the first rule whose `path`
 * prefix matches it.
 *
 * - `invalid_grant`: `/token` → 400 `invalid_grant`; any API → 401 (revoked or expired token).
 * - `access_denied`: the consent endpoint redirects back with `error=access_denied`; elsewhere 403.
 * - `401`, `403`, `429` (with `Retry-After`), `500`, `503`: that status with a Google error body.
 * - `latencyMs`: delay before handling, alone or with `fail`.
 */
export const ControlRuleInput = z
  .strictObject({
    next: z.int().min(1).max(1000).default(1),
    fail: z
      .union([
        z.literal('invalid_grant'),
        z.literal('access_denied'),
        z.literal(401),
        z.literal(403),
        z.literal(429),
        z.literal(500),
        z.literal(503),
      ])
      .optional(),
    retryAfter: z.int().min(0).max(3600).default(1),
    latencyMs: z.int().min(0).max(120_000).optional(),
    path: z.string().startsWith('/').optional(),
  })
  .refine((rule) => rule.fail !== undefined || rule.latencyMs !== undefined, {
    message: 'A rule needs fail or latencyMs',
  });

export type Failure = NonNullable<z.output<typeof ControlRuleInput>['fail']>;

export interface ControlEffect {
  fail?: Failure;
  retryAfter: number;
  latencyMs?: number;
}

interface ControlRule extends ControlEffect {
  remaining: number;
  path?: string;
}

export function describeEffect(effect: ControlEffect): string | null {
  if (effect.fail !== undefined) return String(effect.fail);
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
