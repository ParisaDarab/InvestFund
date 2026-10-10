/**
 * Private conversations of accepted connections (docs/DOMAIN_RULES.md §3).
 *
 * - Only the two participants can list, read or post; anyone else gets 404.
 * - A message is persisted before it is announced in real time. Sends are idempotent per
 *   `(sender, clientMessageId)`, so a client retry after a timeout never duplicates a message.
 * - Conversations become read-only (history stays visible) when either party blocks the other,
 *   an account is suspended, or the connection is no longer accepted.
 * - Message text is never logged, never put in notifications and never emailed.
 */
import type { ConversationSummary, MessagePage, MessageView } from '@investfund/shared';

import { ConflictError, ForbiddenError, NotFoundError } from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { Effects, type EventPublisher } from '../notifications/effects.js';
import { keysetCursor } from '../shared/cursor.js';
import { blockedUserIds, isBlockedBetween } from '../shared/policies.js';
import { isUniqueViolation } from '../shared/prisma-errors.js';
import { iso, isoOrNull } from '../shared/serialize.js';

import { unreadByConversation } from './unread.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient, UnitOfWork } from '../../core/db/unit-of-work.js';
import type { Logger } from '../../core/logger/logger.js';
import type { Notifier } from '../notifications/notifier.js';

const PREVIEW_LENGTH = 120;

const conversationInclude = {
  connection: {
    select: {
      status: true,
      supporterId: true,
      founderId: true,
      startup: { select: { id: true, slug: true, name: true } },
      supporter: { select: { status: true, supporterProfile: { select: { displayName: true } } } },
      founder: { select: { status: true, founderProfile: { select: { displayName: true } } } },
    },
  },
  messages: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
} satisfies Prisma.ConversationInclude;

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>;

interface MessageRow {
  id: string;
  conversationId: string;
  senderId: string;
  clientMessageId: string;
  body: string;
  createdAt: Date;
}

export const toMessageView = (m: MessageRow): MessageView => ({
  id: m.id,
  conversationId: m.conversationId,
  senderId: m.senderId,
  clientMessageId: m.clientMessageId,
  body: m.body,
  createdAt: iso(m.createdAt),
});

function counterpartOf(row: ConversationRow, userId: string) {
  const c = row.connection;
  return c.supporterId === userId
    ? {
        id: c.founderId,
        displayName: c.founder.founderProfile?.displayName ?? 'Founder',
        status: c.founder.status,
      }
    : {
        id: c.supporterId,
        displayName: c.supporter.supporterProfile?.displayName ?? 'Supporter',
        status: c.supporter.status,
      };
}

export class ConversationService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uow: UnitOfWork,
    private readonly notifier: Notifier,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
  ) {}

  async list(userId: string): Promise<ConversationSummary[]> {
    const rows = await this.prisma.conversation.findMany({
      where: { participants: { some: { userId } } },
      include: conversationInclude,
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      take: 200,
    });
    const unread = await unreadByConversation(
      this.prisma,
      userId,
      rows.map((r) => r.id),
    );
    const blocked = new Set(await blockedUserIds(this.prisma, userId));
    return rows.map((row) => this.toSummary(row, userId, unread.get(row.id) ?? 0, blocked));
  }

  async get(userId: string, conversationId: string): Promise<ConversationSummary> {
    const row = await this.loadForParticipant(this.prisma, userId, conversationId);
    const unread = await unreadByConversation(this.prisma, userId, [row.id]);
    const blocked = new Set(await blockedUserIds(this.prisma, userId));
    return this.toSummary(row, userId, unread.get(row.id) ?? 0, blocked);
  }

  async messages(
    userId: string,
    conversationId: string,
    cursor: string | undefined,
    limit: number,
  ): Promise<MessagePage> {
    await this.loadForParticipant(this.prisma, userId, conversationId);
    const key = keysetCursor.decode(cursor);
    const rows = await this.prisma.message.findMany({
      where: {
        conversationId,
        ...(key === null
          ? {}
          : {
              OR: [
                { createdAt: { lt: key.createdAt } },
                { createdAt: key.createdAt, id: { lt: key.id } },
              ],
            }),
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return {
      data: page.map(toMessageView),
      nextCursor: rows.length > limit && last !== undefined ? keysetCursor.encode(last) : null,
    };
  }

  /** Returns the message and whether it was newly created (false for an idempotent retry). */
  async send(
    userId: string,
    conversationId: string,
    clientMessageId: string,
    body: string,
  ): Promise<{ message: MessageView; created: boolean }> {
    const existing = await this.findByClientId(userId, clientMessageId);
    if (existing !== null) return this.retryResult(existing, conversationId);

    const effects = new Effects();
    let message: MessageRow;
    try {
      message = await this.uow.run(async (tx) => {
        const row = await this.loadForParticipant(tx, userId, conversationId);
        const other = counterpartOf(row, userId);
        if (await this.isReadOnly(tx, row, userId)) {
          throw new ForbiddenError('This conversation is read-only.');
        }
        const now = new Date();
        const created = await tx.message.create({
          data: {
            id: newId(),
            conversationId,
            senderId: userId,
            clientMessageId,
            body,
            createdAt: now,
          },
        });
        await tx.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: now },
        });
        await tx.conversationParticipant.update({
          where: { conversationId_userId: { conversationId, userId } },
          data: { lastReadAt: now },
        });

        // Notify only for the first unread message of a burst, not for every message.
        const recipient = await tx.conversationParticipant.findUniqueOrThrow({
          where: { conversationId_userId: { conversationId, userId: other.id } },
        });
        const earlierUnread = await tx.message.count({
          where: {
            conversationId,
            senderId: userId,
            id: { not: created.id },
            ...(recipient.lastReadAt === null ? {} : { createdAt: { gt: recipient.lastReadAt } }),
          },
        });
        if (earlierUnread === 0) {
          const sender = counterpartOf(row, other.id);
          await this.notifier.notify(tx, effects, {
            userId: other.id,
            type: 'message_received',
            data: { actorName: sender.displayName, startupName: row.connection.startup.name },
            link: `/app/messages/${conversationId}`,
            dedupeKey: `message_received:${created.id}`,
          });
        }
        effects.emit({
          userIds: [userId, other.id],
          type: 'message.created',
          data: { conversationId, message: toMessageView(created) },
        });
        return created;
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        const raced = await this.findByClientId(userId, clientMessageId);
        if (raced !== null) return this.retryResult(raced, conversationId);
      }
      throw error;
    }
    await effects.flush(this.publisher, this.logger);
    return { message: toMessageView(message), created: true };
  }

  async markRead(userId: string, conversationId: string): Promise<void> {
    await this.loadForParticipant(this.prisma, userId, conversationId);
    const latest = await this.prisma.message.findFirst({
      where: { conversationId },
      orderBy: [{ createdAt: 'desc' }],
      select: { createdAt: true },
    });
    const readAt = latest?.createdAt ?? new Date();
    // Never move the marker backwards (an older tab must not "unread" newer messages).
    await this.prisma.conversationParticipant.updateMany({
      where: {
        conversationId,
        userId,
        OR: [{ lastReadAt: null }, { lastReadAt: { lt: readAt } }],
      },
      data: { lastReadAt: readAt },
    });
    const effects = new Effects();
    effects.emit({ userIds: [userId], type: 'conversation.read', data: { conversationId } });
    await effects.flush(this.publisher, this.logger);
  }

  private async findByClientId(
    userId: string,
    clientMessageId: string,
  ): Promise<MessageRow | null> {
    return this.prisma.message.findUnique({
      where: { senderId_clientMessageId: { senderId: userId, clientMessageId } },
    });
  }

  private retryResult(existing: MessageRow, conversationId: string) {
    if (existing.conversationId !== conversationId) {
      throw new ConflictError('This client message id was already used in another conversation.', {
        slug: 'idempotency-key-reuse',
      });
    }
    return { message: toMessageView(existing), created: false };
  }

  private async loadForParticipant(
    db: TransactionClient | PrismaClient,
    userId: string,
    conversationId: string,
  ): Promise<ConversationRow> {
    const row = await db.conversation.findUnique({
      where: { id: conversationId },
      include: conversationInclude,
    });
    if (row === null) throw new NotFoundError('The conversation was not found.');
    const { supporterId, founderId } = row.connection;
    if (userId !== supporterId && userId !== founderId) {
      throw new NotFoundError('The conversation was not found.');
    }
    return row;
  }

  private async isReadOnly(
    db: TransactionClient | PrismaClient,
    row: ConversationRow,
    userId: string,
  ) {
    const other = counterpartOf(row, userId);
    if (row.connection.status !== 'accepted' || other.status !== 'active') return true;
    return isBlockedBetween(db, userId, other.id);
  }

  private toSummary(
    row: ConversationRow,
    userId: string,
    unreadCount: number,
    blocked: ReadonlySet<string>,
  ): ConversationSummary {
    const other = counterpartOf(row, userId);
    const last = row.messages[0];
    return {
      id: row.id,
      connectionId: row.connectionId,
      startup: row.connection.startup,
      counterpart: { id: other.id, displayName: other.displayName },
      lastMessage:
        last === undefined
          ? null
          : {
              senderId: last.senderId,
              preview: last.body.slice(0, PREVIEW_LENGTH),
              createdAt: iso(last.createdAt),
            },
      lastMessageAt: isoOrNull(row.lastMessageAt),
      unreadCount,
      readOnly:
        row.connection.status !== 'accepted' || other.status !== 'active' || blocked.has(other.id),
    };
  }
}
