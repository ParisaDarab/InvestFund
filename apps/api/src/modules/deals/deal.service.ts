/**
 * Negotiation and funding-outcome workflow (docs/DOMAIN_RULES.md §4).
 *
 * Concurrency: every write locks the deal row (`SELECT ... FOR UPDATE`) inside its transaction,
 * so two responses to the same offer are serialised; the loser sees the new state and gets 409.
 * Clients also name the offer (`offerId`) or deal `version` they are acting on, so an action is
 * never applied to terms the actor has not seen.
 *
 * Immutability: offer terms are never updated. Counters and revisions create a new revision
 * linked by `previous_offer_id`; only status fields of the old revision change.
 *
 * Semantics: an accepted offer records agreement on the platform only. Funding happens outside
 * the platform; "reported" and "confirmed" are statements by the parties, never verification.
 */
import {
  DEAL_ACTIONS_REQUIRING_REASON,
  DEAL_TRANSITIONS,
  OFFER_TRANSITIONS,
  TERMINAL_DEAL_STATUSES,
  transition,
  type DealAction,
  type DealPage,
  type DealStatus,
  type DealView,
  type NotificationType,
  type OfferAction,
  type OfferTerms,
} from '@investfund/shared';

import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { Effects, type EventPublisher } from '../notifications/effects.js';
import { recordAudit } from '../shared/audit.js';
import { offsetCursor } from '../shared/cursor.js';
import { isBlockedBetween } from '../shared/policies.js';
import { isUniqueViolation } from '../shared/prisma-errors.js';

import { actorOf, dealInclude, toDealSummary, toDealView, type DealRow } from './deal.mapper.js';

import type { Prisma, PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient, UnitOfWork } from '../../core/db/unit-of-work.js';
import type { Logger } from '../../core/logger/logger.js';
import type { Notifier } from '../notifications/notifier.js';
import type { z } from 'zod';

type Terms = z.output<typeof OfferTerms>;

/** Longest allowed response window for an offer. */
export const MAX_RESPOND_BY_DAYS = 90;

type DealEventType =
  | 'offer_created'
  | 'offer_countered'
  | 'offer_revised'
  | 'offer_accepted'
  | 'offer_declined'
  | 'offer_withdrawn'
  | 'offer_expired'
  | DealAction;

export class DealService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uow: UnitOfWork,
    private readonly notifier: Notifier,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
    private readonly now: () => Date = () => new Date(),
  ) {}

  // ── Reads ──

  async get(userId: string, dealId: string): Promise<DealView> {
    const row = await this.prisma.deal.findUnique({ where: { id: dealId }, include: dealInclude });
    if (row === null || (row.supporterId !== userId && row.founderId !== userId)) {
      throw new NotFoundError('The deal was not found.');
    }
    return toDealView(row, userId, await this.isInteractive(this.prisma, row));
  }

  async list(
    userId: string,
    query: {
      status: 'open' | 'closed' | 'all';
      connectionId?: string | undefined;
      cursor?: string | undefined;
      limit: number;
    },
  ): Promise<DealPage> {
    const terminal = [...TERMINAL_DEAL_STATUSES];
    const where: Prisma.DealWhereInput = {
      AND: [
        { OR: [{ supporterId: userId }, { founderId: userId }] },
        query.connectionId === undefined ? {} : { connectionId: query.connectionId },
        query.status === 'open'
          ? { status: { notIn: terminal } }
          : query.status === 'closed'
            ? { status: { in: terminal } }
            : {},
      ],
    };
    const offset = offsetCursor.decode(query.cursor);
    const rows = await this.prisma.deal.findMany({
      where,
      include: dealInclude,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      skip: offset,
      take: query.limit + 1,
    });
    return {
      data: rows.slice(0, query.limit).map((row) => toDealSummary(row, userId)),
      nextCursor: rows.length > query.limit ? offsetCursor.encode(offset + query.limit) : null,
    };
  }

  // ── Negotiation ──

  async create(userId: string, connectionId: string, terms: Terms): Promise<DealView> {
    const connection = await this.prisma.connection.findUnique({
      where: { id: connectionId },
      include: {
        startup: { select: { id: true, name: true, currency: true } },
        supporter: { select: { status: true } },
        founder: { select: { status: true } },
      },
    });
    if (
      connection === null ||
      (connection.supporterId !== userId && connection.founderId !== userId)
    ) {
      throw new NotFoundError('The connection was not found.');
    }
    if (connection.status !== 'accepted') {
      throw new ConflictError('Proposals need an accepted connection.', { slug: 'invalid-state' });
    }
    if (connection.supporter.status !== 'active' || connection.founder.status !== 'active') {
      throw new ForbiddenError('This connection is no longer active.');
    }
    if (await isBlockedBetween(this.prisma, connection.supporterId, connection.founderId)) {
      throw new ForbiddenError('You cannot send proposals to this user.');
    }
    await this.assertTerms(this.prisma, connection.startup.id, connection.startup.currency, terms);

    const recipientId =
      userId === connection.supporterId ? connection.founderId : connection.supporterId;
    const dealId = newId();
    const offerId = newId();
    const effects = new Effects();
    try {
      await this.uow.run(async (tx) => {
        await tx.deal.create({
          data: {
            id: dealId,
            connectionId,
            startupId: connection.startupId,
            supporterId: connection.supporterId,
            founderId: connection.founderId,
          },
        });
        await this.createOffer(tx, {
          id: offerId,
          dealId,
          revision: 1,
          previousOfferId: null,
          createdById: userId,
          recipientId,
          terms,
        });
        await tx.deal.update({ where: { id: dealId }, data: { currentOfferId: offerId } });
        await this.event(tx, dealId, userId, 'offer_created', null, 'negotiating', offerId, null);
        await recordAudit(tx, {
          actorId: userId,
          action: 'offer.created',
          entityType: 'deal',
          entityId: dealId,
          metadata: { offerId, revision: 1 },
        });
        await this.notify(
          tx,
          effects,
          recipientId,
          'offer_received',
          dealId,
          offerId,
          userId,
          connection.startup.name,
        );
        effects.emit({ userIds: [userId, recipientId], type: 'deal.updated', data: { dealId } });
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictError(
          'A negotiation is already open on this connection. Respond to it instead.',
          { slug: 'invalid-state' },
        );
      }
      throw error;
    }
    await effects.flush(this.publisher, this.logger);
    return this.get(userId, dealId);
  }

  async respond(
    userId: string,
    dealId: string,
    offerId: string,
    action: Exclude<OfferAction, 'expire'>,
    terms: Terms | undefined,
    note: string | null,
  ): Promise<DealView> {
    const effects = new Effects();
    // The lazy expiry must commit, so it is returned as an outcome rather than thrown.
    const outcome = await this.uow.run(async (tx): Promise<'done' | 'expired'> => {
      const deal = await this.lockDeal(tx, userId, dealId);
      if (deal.status !== 'negotiating' || deal.currentOfferId === null) {
        throw new ConflictError('This negotiation is closed.', { slug: 'invalid-state' });
      }
      if (deal.currentOfferId !== offerId) {
        throw new ConflictError('The proposal changed. Review the latest terms and try again.', {
          slug: 'version-conflict',
        });
      }
      const offer = deal.offers.find((o) => o.id === offerId);
      if (offer?.status !== 'pending') {
        throw new ConflictError('This proposal is no longer open.', { slug: 'invalid-state' });
      }
      if (offer.respondBy !== null && offer.respondBy <= this.now()) {
        await this.expireOffer(tx, effects, deal, offer.id);
        return 'expired';
      }

      const actor = offer.createdById === userId ? 'creator' : 'recipient';
      const result = transition(OFFER_TRANSITIONS, 'pending', action, actor);
      if (!result.ok) {
        throw new ForbiddenError(
          actor === 'creator'
            ? 'You cannot respond to your own proposal.'
            : 'Only the person who made the proposal can do that.',
        );
      }
      const closing = action === 'withdraw' || action === 'decline';
      if (!closing && !(await this.isInteractive(tx, deal))) {
        throw new ForbiddenError('Negotiation is disabled between these users.');
      }

      const now = this.now();
      const { count } = await tx.offer.updateMany({
        where: { id: offerId, status: 'pending' },
        data: { status: result.to, respondedAt: now, respondedById: userId },
      });
      if (count === 0)
        throw new ConflictError('This proposal is no longer open.', { slug: 'invalid-state' });

      const otherId = userId === deal.supporterId ? deal.founderId : deal.supporterId;
      const startupName = deal.startup.name;
      let nextOfferId: string | null = null;
      let nextStatus: DealStatus = 'negotiating';
      if (action === 'counter' || action === 'revise') {
        if (terms === undefined) throw new ValidationError('Terms are required.');
        await this.assertTerms(
          tx,
          deal.startupId,
          await this.startupCurrency(tx, deal.startupId),
          terms,
        );
        nextOfferId = newId();
        await this.createOffer(tx, {
          id: nextOfferId,
          dealId,
          revision: Math.max(...deal.offers.map((o) => o.revision)) + 1,
          previousOfferId: offerId,
          createdById: userId,
          recipientId: otherId,
          terms,
        });
      } else {
        nextStatus =
          action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn';
      }

      await this.updateDeal(tx, deal, {
        status: nextStatus,
        currentOfferId: nextOfferId,
        ...(action === 'accept' ? { acceptedOfferId: offerId } : {}),
      });
      const eventType: DealEventType =
        action === 'counter'
          ? 'offer_countered'
          : action === 'revise'
            ? 'offer_revised'
            : `offer_${action === 'accept' ? 'accepted' : action === 'decline' ? 'declined' : 'withdrawn'}`;
      await this.event(
        tx,
        dealId,
        userId,
        eventType,
        'negotiating',
        nextStatus,
        nextOfferId ?? offerId,
        note,
      );
      await recordAudit(tx, {
        actorId: userId,
        action: `offer.${action}`,
        entityType: 'deal',
        entityId: dealId,
        metadata: { offerId, ...(nextOfferId === null ? {} : { nextOfferId }) },
      });
      const type: NotificationType =
        action === 'counter'
          ? 'offer_countered'
          : action === 'revise'
            ? 'offer_revised'
            : action === 'accept'
              ? 'offer_accepted'
              : action === 'decline'
                ? 'offer_declined'
                : 'offer_withdrawn';
      await this.notify(
        tx,
        effects,
        otherId,
        type,
        dealId,
        nextOfferId ?? offerId,
        userId,
        startupName,
      );
      effects.emit({ userIds: [userId, otherId], type: 'deal.updated', data: { dealId } });
      return 'done';
    });
    await effects.flush(this.publisher, this.logger);
    if (outcome === 'expired') {
      throw new ConflictError('This proposal expired before it was answered.', {
        slug: 'invalid-state',
      });
    }
    return this.get(userId, dealId);
  }

  // ── Outcome lifecycle ──

  async act(
    userId: string,
    dealId: string,
    action: DealAction,
    version: number,
    reason: string | null,
  ): Promise<DealView> {
    if (DEAL_ACTIONS_REQUIRING_REASON.has(action) && (reason === null || reason.trim() === '')) {
      throw new ValidationError('A reason is required.', {
        errors: [{ path: 'body.reason', code: 'required', message: 'A reason is required.' }],
      });
    }
    const effects = new Effects();
    await this.uow.run(async (tx) => {
      const deal = await this.lockDeal(tx, userId, dealId);
      if (deal.version !== version) {
        throw new ConflictError('The deal changed since you loaded it. Reload and try again.', {
          slug: 'version-conflict',
        });
      }
      const actor = actorOf(deal, userId);
      const result = transition(DEAL_TRANSITIONS, deal.status, action, actor);
      if (!result.ok) {
        if (result.reason === 'not_allowed')
          throw new ForbiddenError('You cannot do that on this deal.');
        throw new ConflictError(
          `Not possible while the deal is ${deal.status.replace('_', ' ')}.`,
          {
            slug: 'invalid-state',
          },
        );
      }
      const isRequester = deal.cancellationRequestedById === userId;
      if (action === 'withdraw_cancellation' && !isRequester) {
        throw new ForbiddenError(
          'Only the person who asked can withdraw the cancellation request.',
        );
      }
      if ((action === 'confirm_cancellation' || action === 'reject_cancellation') && isRequester) {
        throw new ForbiddenError('The other party must answer your cancellation request.');
      }

      const now = this.now();
      let data: Prisma.DealUncheckedUpdateManyInput;
      let to: DealStatus = result.to;
      switch (action) {
        case 'report_funding':
          data = { status: to, fundingReportedAt: now };
          break;
        case 'confirm_receipt':
          data = { status: to, receiptConfirmedAt: now, completedAt: now };
          break;
        case 'dispute_receipt':
          data = { status: to };
          break;
        case 'cancel':
        case 'confirm_cancellation':
          data = {
            status: 'cancelled',
            cancelledAt: now,
            ...(action === 'cancel' ? { cancellationReason: reason } : {}),
            cancellationRequestedById:
              action === 'cancel' ? userId : deal.cancellationRequestedById,
            cancellationFromStatus: null,
          };
          to = 'cancelled';
          break;
        case 'request_cancellation':
          data = {
            status: to,
            cancellationRequestedById: userId,
            cancellationFromStatus: deal.status,
            cancellationReason: reason,
          };
          break;
        case 'reject_cancellation':
        case 'withdraw_cancellation':
          to = deal.cancellationFromStatus ?? 'accepted';
          data = {
            status: to,
            cancellationRequestedById: null,
            cancellationFromStatus: null,
            cancellationReason: null,
          };
          break;
      }
      await this.updateDeal(tx, deal, data);
      await this.event(tx, dealId, userId, action, deal.status, to, deal.acceptedOfferId, reason);
      await recordAudit(tx, {
        actorId: userId,
        action: `deal.${action}`,
        entityType: 'deal',
        entityId: dealId,
        metadata: { from: deal.status, to },
      });

      const otherId = userId === deal.supporterId ? deal.founderId : deal.supporterId;
      const type: NotificationType | null = (
        {
          report_funding: 'funding_reported',
          confirm_receipt: 'deal_completed',
          dispute_receipt: 'receipt_disputed',
          cancel: 'deal_cancelled',
          request_cancellation: 'cancellation_requested',
          confirm_cancellation: 'deal_cancelled',
          reject_cancellation: 'cancellation_rejected',
          withdraw_cancellation: 'cancellation_withdrawn',
        } as const
      )[action];
      await this.notify(
        tx,
        effects,
        otherId,
        type,
        dealId,
        `${action}:${String(deal.version)}`,
        userId,
        deal.startup.name,
      );
      effects.emit({ userIds: [userId, otherId], type: 'deal.updated', data: { dealId } });
    });
    await effects.flush(this.publisher, this.logger);
    return this.get(userId, dealId);
  }

  /** Expires every pending offer past its `respondBy` (run periodically). Returns the count. */
  async expireDueOffers(): Promise<number> {
    const due = await this.prisma.offer.findMany({
      where: { status: 'pending', respondBy: { lte: this.now() } },
      select: { id: true, dealId: true },
      take: 100,
    });
    let expired = 0;
    for (const offer of due) {
      const effects = new Effects();
      await this.uow.run(async (tx) => {
        const deal = await this.lockDealById(tx, offer.dealId);
        if (deal?.currentOfferId !== offer.id || deal.status !== 'negotiating') return;
        await this.expireOffer(tx, effects, deal, offer.id);
        expired += 1;
      });
      await effects.flush(this.publisher, this.logger);
    }
    return expired;
  }

  // ── Internals ──

  private async expireOffer(
    tx: TransactionClient,
    effects: Effects,
    deal: DealRow,
    offerId: string,
  ) {
    await tx.offer.updateMany({
      where: { id: offerId, status: 'pending' },
      data: { status: 'expired', respondedAt: this.now() },
    });
    await this.updateDeal(tx, deal, { status: 'expired', currentOfferId: null });
    await this.event(tx, deal.id, null, 'offer_expired', 'negotiating', 'expired', offerId, null);
    for (const userId of [deal.supporterId, deal.founderId]) {
      await this.notifier.notify(tx, effects, {
        userId,
        type: 'offer_expired',
        data: { startupName: deal.startup.name },
        link: `/app/deals/${deal.id}`,
        dedupeKey: `offer_expired:${offerId}`,
      });
    }
    effects.emit({
      userIds: [deal.supporterId, deal.founderId],
      type: 'deal.updated',
      data: { dealId: deal.id },
    });
  }

  private async lockDealById(tx: TransactionClient, dealId: string): Promise<DealRow | null> {
    await tx.$queryRaw`SELECT id FROM deals WHERE id = ${dealId}::uuid FOR UPDATE`;
    return tx.deal.findUnique({ where: { id: dealId }, include: dealInclude });
  }

  private async lockDeal(tx: TransactionClient, userId: string, dealId: string): Promise<DealRow> {
    const deal = await this.lockDealById(tx, dealId);
    if (deal === null || (deal.supporterId !== userId && deal.founderId !== userId)) {
      throw new NotFoundError('The deal was not found.');
    }
    return deal;
  }

  private async updateDeal(
    tx: TransactionClient,
    deal: DealRow,
    data: Prisma.DealUncheckedUpdateManyInput,
  ): Promise<void> {
    const { count } = await tx.deal.updateMany({
      where: { id: deal.id, version: deal.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (count === 0) {
      throw new ConflictError('The deal changed. Reload and try again.', {
        slug: 'version-conflict',
      });
    }
  }

  private async isInteractive(
    db: TransactionClient | PrismaClient,
    deal: DealRow,
  ): Promise<boolean> {
    if (deal.supporter.status !== 'active' || deal.founder.status !== 'active') return false;
    return !(await isBlockedBetween(db, deal.supporterId, deal.founderId));
  }

  private async startupCurrency(tx: TransactionClient, startupId: string): Promise<string> {
    const startup = await tx.startup.findUniqueOrThrow({
      where: { id: startupId },
      select: { currency: true },
    });
    return startup.currency;
  }

  private async assertTerms(
    db: TransactionClient | PrismaClient,
    startupId: string,
    currency: string,
    terms: Terms,
  ): Promise<void> {
    const errors: { path: string; code: string; message: string }[] = [];
    if (terms.currency !== currency) {
      errors.push({
        path: 'body.terms.currency',
        code: 'currency_mismatch',
        message: `Proposals for this startup must be in ${currency}.`,
      });
    }
    if (terms.respondBy !== undefined && terms.respondBy !== null) {
      const at = new Date(terms.respondBy).getTime();
      const now = this.now().getTime();
      if (at <= now) {
        errors.push({
          path: 'body.terms.respondBy',
          code: 'in_past',
          message: 'The response deadline must be in the future.',
        });
      } else if (at > now + MAX_RESPOND_BY_DAYS * 86_400_000) {
        errors.push({
          path: 'body.terms.respondBy',
          code: 'too_far',
          message: `The response deadline must be within ${String(MAX_RESPOND_BY_DAYS)} days.`,
        });
      }
    }
    const ids = [...new Set(terms.milestoneIds)];
    if (ids.length > 0) {
      const found = await db.startupMilestone.count({ where: { id: { in: ids }, startupId } });
      if (found !== ids.length) {
        errors.push({
          path: 'body.terms.milestoneIds',
          code: 'unknown_milestone',
          message: 'Every milestone must belong to this startup.',
        });
      }
    }
    if (errors.length > 0)
      throw new BusinessRuleError('The proposed terms break a rule.', { errors });
  }

  private async createOffer(
    tx: TransactionClient,
    input: {
      id: string;
      dealId: string;
      revision: number;
      previousOfferId: string | null;
      createdById: string;
      recipientId: string;
      terms: Terms;
    },
  ): Promise<void> {
    const { terms } = input;
    await tx.offer.create({
      data: {
        id: input.id,
        dealId: input.dealId,
        revision: input.revision,
        previousOfferId: input.previousOfferId,
        createdById: input.createdById,
        recipientId: input.recipientId,
        fundingType: terms.fundingType,
        amountMinor: BigInt(terms.amountMinor),
        currency: terms.currency,
        purpose: terms.purpose,
        conditions: terms.conditions ?? null,
        message: terms.message ?? null,
        respondBy:
          terms.respondBy === undefined || terms.respondBy === null
            ? null
            : new Date(terms.respondBy),
        milestones: {
          create: [...new Set(terms.milestoneIds)].map((milestoneId) => ({ milestoneId })),
        },
      },
    });
  }

  private async event(
    tx: TransactionClient,
    dealId: string,
    actorId: string | null,
    type: DealEventType,
    fromStatus: DealStatus | null,
    toStatus: DealStatus,
    offerId: string | null,
    note: string | null,
  ): Promise<void> {
    await tx.dealEvent.create({
      data: { id: newId(), dealId, actorId, type, fromStatus, toStatus, offerId, note },
    });
  }

  private async notify(
    tx: TransactionClient,
    effects: Effects,
    userId: string,
    type: NotificationType,
    dealId: string,
    discriminator: string,
    actorId: string,
    startupName: string,
  ): Promise<void> {
    const actor = await tx.user.findUnique({
      where: { id: actorId },
      select: {
        founderProfile: { select: { displayName: true } },
        supporterProfile: { select: { displayName: true } },
      },
    });
    const actorName =
      actor?.supporterProfile?.displayName ??
      actor?.founderProfile?.displayName ??
      'The other party';
    await this.notifier.notify(tx, effects, {
      userId,
      type,
      data: { startupName, actorName },
      link: `/app/deals/${dealId}`,
      dedupeKey: `${type}:${dealId}:${discriminator}`,
    });
  }
}
