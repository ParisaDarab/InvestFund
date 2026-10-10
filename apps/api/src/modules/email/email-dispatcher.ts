/**
 * Delivers `email_outbox` rows asynchronously (transactional outbox pattern).
 *
 * Each tick leases a batch with `FOR UPDATE SKIP LOCKED` (safe with several API instances),
 * sends, and marks rows `sent`, `skipped` or schedules a retry with exponential backoff. After
 * `MAX_ATTEMPTS` a row becomes `failed` (visible in the admin overview). Delivery is
 * at-least-once: a crash between the provider accepting a message and the row update can repeat
 * that one email.
 */
import { renderEmail } from './templates.js';

import type { EmailSender } from './email-sender.js';
import type { PrismaClient } from '../../core/db/prisma.js';
import type { Logger } from '../../core/logger/logger.js';

export const MAX_ATTEMPTS = 5;
const LEASE_SECONDS = 120;
const BATCH_SIZE = 10;

interface LeasedRow {
  id: string;
  to_email: string;
  template: string;
  data: Record<string, string>;
  attempts: number;
}

export class EmailDispatcher {
  #timer: NodeJS.Timeout | null = null;
  #running: Promise<number> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly sender: EmailSender,
    private readonly webOrigin: string,
    private readonly logger: Logger,
  ) {}

  start(intervalMs = 5000): void {
    if (this.#timer !== null) return;
    this.#timer = setInterval(() => {
      void this.tick().catch((error: unknown) => {
        this.logger.warn({ err: { message: String(error) } }, 'email dispatch tick failed');
      });
    }, intervalMs);
    this.#timer.unref();
  }

  async stop(): Promise<void> {
    if (this.#timer !== null) clearInterval(this.#timer);
    this.#timer = null;
    await this.#running?.catch(() => undefined);
  }

  /** Processes one batch; returns the number of rows handled. */
  tick(): Promise<number> {
    this.#running ??= this.processBatch().finally(() => {
      this.#running = null;
    });
    return this.#running;
  }

  private async processBatch(): Promise<number> {
    const rows = await this.prisma.$queryRaw<LeasedRow[]>`
      UPDATE email_outbox SET
        attempts = attempts + 1,
        next_attempt_at = now() + make_interval(secs => ${LEASE_SECONDS}),
        updated_at = now()
      WHERE id IN (
        SELECT id FROM email_outbox
        WHERE status = 'pending' AND next_attempt_at <= now()
        ORDER BY next_attempt_at
        LIMIT ${BATCH_SIZE}
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_email, template, data, attempts`;

    for (const row of rows) {
      const rendered = renderEmail(row.template, row.data, this.webOrigin);
      if (rendered === null) {
        await this.prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: 'failed', lastError: 'unknown template' },
        });
        continue;
      }
      try {
        const result = await this.sender.send(
          { to: row.to_email, ...rendered },
          { outboxId: row.id, template: row.template },
        );
        await this.prisma.emailOutbox.update({
          where: { id: row.id },
          data: { status: result, sentAt: result === 'sent' ? new Date() : null, lastError: null },
        });
      } catch (error) {
        const giveUp = row.attempts >= MAX_ATTEMPTS;
        const backoffSeconds = 30 * 2 ** (row.attempts - 1);
        // Provider error messages can include addresses: keep only a short, generic reason.
        const reason = (error instanceof Error ? error.name : 'Error').slice(0, 100);
        await this.prisma.emailOutbox.update({
          where: { id: row.id },
          data: {
            status: giveUp ? 'failed' : 'pending',
            lastError: reason,
            nextAttemptAt: new Date(Date.now() + backoffSeconds * 1000),
          },
        });
        this.logger.warn({ outboxId: row.id, attempts: row.attempts, giveUp }, 'email send failed');
      }
    }
    return rows.length;
  }
}
