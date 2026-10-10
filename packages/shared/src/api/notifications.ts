/** In-app notification contracts (docs/API.md §6.9). */
import { z } from 'zod';

import { Cursor, IsoDateTime, Uuid, cursorPage } from './common.js';

export const NOTIFICATION_TYPES = [
  'connection_requested',
  'connection_accepted',
  'connection_declined',
  'message_received',
  'offer_received',
  'offer_countered',
  'offer_revised',
  'offer_accepted',
  'offer_declined',
  'offer_withdrawn',
  'offer_expired',
  'funding_reported',
  'receipt_confirmed',
  'receipt_disputed',
  'deal_completed',
  'cancellation_requested',
  'cancellation_rejected',
  'cancellation_withdrawn',
  'deal_cancelled',
  'document_shared',
  'report_resolved',
  'startup_archived_by_admin',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NotificationView = z
  .object({
    id: Uuid,
    type: z.enum(NOTIFICATION_TYPES),
    /** Display data such as `startupName`, `actorName`; never confidential content. */
    data: z.record(z.string(), z.string()),
    /** App-relative link to the resource. */
    link: z.string(),
    readAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'Notification' });
export type NotificationView = z.infer<typeof NotificationView>;

export const NotificationListQuery = z.strictObject({
  unreadOnly: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const NotificationPage = cursorPage(NotificationView)
  .extend({ unreadCount: z.int().min(0) })
  .meta({ id: 'NotificationPage' });
export type NotificationPage = z.infer<typeof NotificationPage>;

export const MarkNotificationsReadRequest = z
  .strictObject({
    ids: z.array(Uuid).min(1).max(100).optional(),
    all: z.literal(true).optional(),
  })
  .refine((value) => (value.ids === undefined) !== (value.all === undefined), {
    error: 'Send either ids or all.',
  })
  .meta({ id: 'MarkNotificationsReadRequest' });
export type MarkNotificationsReadRequest = z.input<typeof MarkNotificationsReadRequest>;
