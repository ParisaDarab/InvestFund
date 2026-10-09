/**
 * Readiness check registry. Later cards register `db` (P0-DB-01), `redis` and `storage`
 * (P0-API-02). Checks run in parallel with a per-check timeout; a check passes when its
 * promise resolves and fails when it rejects or times out. Failure reasons go to the log only:
 * the public `HealthReport` names the check and its status, nothing else.
 */
import type { HealthCheck, HealthReport } from '@investfund/shared';

import type { Logger } from '../logger/logger.js';

export interface ReadinessCheck {
  /** Short public name, for example `db`. */
  readonly name: string;
  /** Resolves when the dependency is reachable. Should honour `signal` where it can. */
  run(signal: AbortSignal): Promise<void>;
}

export const DEFAULT_CHECK_TIMEOUT_MS = 2000;

export class ReadinessRegistry {
  private readonly checks = new Map<string, ReadinessCheck>();

  constructor(
    private readonly logger: Logger,
    private readonly timeoutMs: number = DEFAULT_CHECK_TIMEOUT_MS,
  ) {}

  register(check: ReadinessCheck): this {
    if (this.checks.has(check.name)) {
      throw new Error(`Readiness check "${check.name}" is already registered`);
    }
    this.checks.set(check.name, check);
    return this;
  }

  names(): string[] {
    return [...this.checks.keys()];
  }

  async report(): Promise<HealthReport> {
    const checks = await Promise.all([...this.checks.values()].map((check) => this.runOne(check)));
    return {
      status: checks.every((check) => check.status === 'ok') ? 'ok' : 'fail',
      checks,
    };
  }

  private async runOne(check: ReadinessCheck): Promise<HealthCheck> {
    const controller = new AbortController();
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        // Reject before aborting: a check that settles on abort must not win the race.
        reject(new Error(`timed out after ${String(this.timeoutMs)} ms`));
        controller.abort();
      }, this.timeoutMs);
    });
    try {
      await Promise.race([check.run(controller.signal), timeout]);
      return { name: check.name, status: 'ok' };
    } catch (err) {
      this.logger.warn({ err, check: check.name }, 'readiness check failed');
      return { name: check.name, status: 'fail' };
    } finally {
      clearTimeout(timer);
    }
  }
}
