/**
 * Connection requests (docs/DOMAIN_RULES.md §2).
 *
 * - Supporters request; the startup's founder accepts or declines; the requester can withdraw.
 * - One active (pending or accepted) connection per startup/supporter pair, enforced by a
 *   partial unique index, so concurrent duplicate requests resolve to one row and a 409.
 * - Acceptance creates the private conversation in the same transaction (unique per connection).
 * - Blocked pairs cannot request or accept.
 */
import {
  CONNECTION_RETRY_AFTER_DECLINE_DAYS,
  CONNECTION_TRANSITIONS,
  availableActions,
  transition,
  type ConnectionAction,
  type ConnectionPage,
  type ConnectionView,
} from '@investfund/shared';

import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { Effects } from '../notifications/effects.js';
import { recordAudit } from '../shared/audit.js';
import { keysetCursor } from '../shared/cursor.js';
import { blockedUserIds, isBlockedBetween } from '../shared/policies.js';
import { isUniqueViolation } from '../shared/prisma-errors.js';
import { iso, isoOrNull } from '../shared/serialize.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { UnitOfWork } from '../../core/db/unit-of-work.js';
import type { Logger } from '../../core/logger/logger.js';
import type { EventPublisher } from '../notifications/effects.js';
import type { Notifier } from '../notifications/notifier.js';

/** Most pending requests a supporter may have open at once (abuse control). */
export const MAX_PENDING_REQUESTS = 25;

export const connectionInclude = {
  startup: { select: { id: true, slug: true, name: true } },
  supporter: {
    select: { id: true, supporterProfile: { select: { displayName: true, bio: true } } },
  },
  founder: { select: { id: true, founderProfile: { select: { displayName: true } } } },
  conversation: { select: { id: true } },
} satisfies Prisma.ConnectionInclude;

type ConnectionRow = Prisma.ConnectionGetPayload<{ include: typeof connectionInclude }>;

export function toConnectionView(
  row: ConnectionRow,
  viewerId: string,
  blocked: boolean,
): ConnectionView {
  const viewerRole = row.initiatorId === viewerId ? 'requester' : 'recipient';
  return {
    id: row.id,
    status: row.status,
    startup: row.startup,
    supporter: {
      id: row.supporter.id,
      displayName: row.supporter.supporterProfile?.displayName ?? 'Supporter',
      bio: row.supporter.supporterProfile?.bio ?? null,
    },
    founder: {
      id: row.founder.id,
      displayName: row.founder.founderProfile?.displayName ?? 'Founder',
    },
    initiatorId: row.initiatorId,
    message: row.message,
    createdAt: iso(row.createdAt),
    respondedAt: isoOrNull(row.respondedAt),
    conversationId: row.conversation?.id ?? null,
    viewerRole,
    availableActions: blocked
      ? []
      : availableActions(CONNECTION_TRANSITIONS, row.status, viewerRole),
    blocked,
  };
}

export class ConnectionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uow: UnitOfWork,
    private readonly notifier: Notifier,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
  ) {}

  async request(
    supporterId: string,
    startupId: string,
    message: string | null,
  ): Promise<ConnectionView> {
    const profile = await this.prisma.supporterProfile.findUnique({
      where: { userId: supporterId },
    });
    if (profile === null) {
      throw new BusinessRuleError(
        'Complete your supporter profile before requesting a connection.',
      );
    }
    const startup = await this.prisma.startup.findFirst({
      where: { id: startupId, status: 'published', founder: { status: 'active' } },
      select: { id: true, name: true, founderId: true },
    });
    if (startup === null) throw new NotFoundError('The startup was not found.');
    if (startup.founderId === supporterId) {
      throw new BusinessRuleError('You cannot connect with your own startup.');
    }
    if (await isBlockedBetween(this.prisma, supporterId, startup.founderId)) {
      throw new ForbiddenError('You cannot connect with this founder.');
    }

    const latest = await this.prisma.connection.findFirst({
      where: { startupId, supporterId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (latest?.status === 'pending' || latest?.status === 'accepted') {
      throw new ConflictError('You already have a connection with this startup.');
    }
    if (latest?.status === 'declined' && latest.respondedAt !== null) {
      const retryAt =
        latest.respondedAt.getTime() + CONNECTION_RETRY_AFTER_DECLINE_DAYS * 86_400_000;
      if (Date.now() < retryAt) {
        throw new BusinessRuleError(
          `The founder declined recently. You can ask again after ${String(CONNECTION_RETRY_AFTER_DECLINE_DAYS)} days.`,
        );
      }
    }
    const pending = await this.prisma.connection.count({
      where: { supporterId, status: 'pending' },
    });
    if (pending >= MAX_PENDING_REQUESTS) {
      throw new BusinessRuleError('You have too many pending requests. Wait for replies first.', {
        slug: 'quota-exceeded',
      });
    }

    const id = newId();
    const effects = new Effects();
    try {
      await this.uow.run(async (tx) => {
        await tx.connection.create({
          data: {
            id,
            startupId,
            supporterId,
            founderId: startup.founderId,
            initiatorId: supporterId,
            message,
          },
        });
        await this.notifier.notify(tx, effects, {
          userId: startup.founderId,
          type: 'connection_requested',
          data: { startupName: startup.name, actorName: profile.displayName },
          link: '/app/connections',
          dedupeKey: `connection_requested:${id}`,
        });
        effects.emit({
          userIds: [startup.founderId],
          type: 'connection.updated',
          data: { connectionId: id },
        });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError('You already have a connection with this startup.');
      }
      throw error;
    }
    await effects.flush(this.publisher, this.logger);
    return this.get(supporterId, id);
  }

  async act(
    userId: string,
    connectionId: string,
    action: ConnectionAction,
  ): Promise<ConnectionView> {
    const effects = new Effects();
    await this.uow.run(async (tx) => {
      const row = await tx.connection.findUnique({
        where: { id: connectionId },
        include: connectionInclude,
      });
      if (row === null || (row.supporterId !== userId && row.founderId !== userId)) {
        throw new NotFoundError('The connection was not found.');
      }
      const actor = row.initiatorId === userId ? 'requester' : 'recipient';
      const result = transition(CONNECTION_TRANSITIONS, row.status, action, actor);
      if (!result.ok) {
        if (result.reason === 'not_allowed')
          throw new ForbiddenError('You cannot do that on this request.');
        throw new ConflictError(`The request is already ${row.status}.`, { slug: 'invalid-state' });
      }
      if (action === 'accept' && (await isBlockedBetween(tx, row.supporterId, row.founderId))) {
        throw new ForbiddenError('You cannot accept a request from a blocked user.');
      }
      // Conditional on the status we read: concurrent responses cannot both apply.
      const { count } = await tx.connection.updateMany({
        where: { id: connectionId, status: 'pending' },
        data: { status: result.to, respondedAt: new Date() },
      });
      if (count === 0) {
        throw new ConflictError('The request was already answered.', { slug: 'invalid-state' });
      }
      if (result.to === 'accepted') {
        const conversationId = newId();
        await tx.conversation.create({
          data: {
            id: conversationId,
            connectionId,
            participants: {
              create: [{ userId: row.supporterId }, { userId: row.founderId }],
            },
          },
        });
      }
      await recordAudit(tx, {
        actorId: userId,
        action: `connection.${action}`,
        entityType: 'connection',
        entityId: connectionId,
      });
      if (action !== 'withdraw') {
        await this.notifier.notify(tx, effects, {
          userId: row.supporterId,
          type: action === 'accept' ? 'connection_accepted' : 'connection_declined',
          data: { startupName: row.startup.name },
          link: action === 'accept' ? '/app/messages' : '/app/connections',
          dedupeKey: `connection_${action}:${connectionId}`,
        });
      }
      effects.emit({
        userIds: [row.supporterId, row.founderId],
        type: 'connection.updated',
        data: { connectionId },
      });
    });
    await effects.flush(this.publisher, this.logger);
    return this.get(userId, connectionId);
  }

  async get(userId: string, connectionId: string): Promise<ConnectionView> {
    const row = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      include: connectionInclude,
    });
    if (row === null || (row.supporterId !== userId && row.founderId !== userId)) {
      throw new NotFoundError('The connection was not found.');
    }
    const blocked = await isBlockedBetween(this.prisma, row.supporterId, row.founderId);
    return toConnectionView(row, userId, blocked);
  }

  async list(
    userId: string,
    query: {
      direction: 'incoming' | 'outgoing' | 'all';
      status?: ConnectionView['status'] | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ): Promise<ConnectionPage> {
    const participant: Prisma.ConnectionWhereInput =
      query.direction === 'incoming'
        ? { founderId: userId, initiatorId: { not: userId } }
        : query.direction === 'outgoing'
          ? { initiatorId: userId }
          : { OR: [{ supporterId: userId }, { founderId: userId }] };
    const key = keysetCursor.decode(query.cursor);
    const rows = await this.prisma.connection.findMany({
      where: {
        AND: [
          participant,
          query.status === undefined ? {} : { status: query.status },
          key === null
            ? {}
            : {
                OR: [
                  { createdAt: { lt: key.createdAt } },
                  { createdAt: key.createdAt, id: { lt: key.id } },
                ],
              },
        ],
      },
      include: connectionInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit);
    const blocked = new Set(await blockedUserIds(this.prisma, userId));
    const last = page[page.length - 1];
    return {
      data: page.map((row) =>
        toConnectionView(
          row,
          userId,
          blocked.has(row.supporterId === userId ? row.founderId : row.supporterId),
        ),
      ),
      nextCursor:
        rows.length > query.limit && last !== undefined ? keysetCursor.encode(last) : null,
    };
  }
}
