/**
 * Creates in-app notifications and queues transactional email in the caller's transaction.
 *
 * - Idempotent: `(user_id, dedupe_key)` is unique, so a retried operation creates nothing new
 *   and queues no second email.
 * - Email goes through the outbox (`email_outbox`), delivered asynchronously by
 *   `EmailDispatcher`, so slow SMTP never blocks or rolls back a domain transaction.
 * - `data` holds display values only (names); never message text, offer conditions or document
 *   content.
 */
import type { NotificationType, NotificationView } from '@investfund/shared';

import { newId } from '../../core/ids/index.js';

import type { Effects } from './effects.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';

export interface NotifyInput {
  readonly userId: string;
  readonly type: NotificationType;
  readonly data: Record<string, string>;
  /** App-relative link, for example `/app/deals/<id>`. */
  readonly link: string;
  readonly dedupeKey: string;
  /** Queue an email too (respects the user's preference). Defaults to true. */
  readonly email?: boolean;
}

export class Notifier {
  async notify(tx: TransactionClient, effects: Effects, input: NotifyInput): Promise<void> {
    const id = newId();
    const createdAt = new Date();
    const { count } = await tx.notification.createMany({
      data: [
        {
          id,
          userId: input.userId,
          type: input.type,
          data: input.data,
          link: input.link,
          dedupeKey: input.dedupeKey,
          createdAt,
        },
      ],
      skipDuplicates: true,
    });
    if (count === 0) return;

    const notification: NotificationView = {
      id,
      type: input.type,
      data: input.data,
      link: input.link,
      readAt: null,
      createdAt: createdAt.toISOString(),
    };
    effects.emit({ userIds: [input.userId], type: 'notification.created', data: { notification } });

    if (input.email === false) return;
    const user = await tx.user.findUnique({
      where: { id: input.userId },
      select: { email: true, emailNotifications: true, status: true },
    });
    if (user === null || !user.emailNotifications || user.status !== 'active') return;
    await tx.emailOutbox.createMany({
      data: [
        {
          id: newId(),
          userId: input.userId,
          toEmail: user.email,
          template: input.type,
          data: { ...input.data, link: input.link },
          dedupeKey: `notification:${input.userId}:${input.dedupeKey}`,
        },
      ],
      skipDuplicates: true,
    });
  }
}
