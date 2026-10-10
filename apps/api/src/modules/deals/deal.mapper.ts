import {
  DEAL_TRANSITIONS,
  OFFER_TRANSITIONS,
  availableActions,
  type DealAction,
  type DealSummary,
  type DealView,
  type OfferAction,
  type OfferView,
} from '@investfund/shared';

import { iso, isoOrNull, minor } from '../shared/serialize.js';

import type { Prisma } from '../../core/db/prisma.js';

export const offerInclude = {
  milestones: { include: { milestone: { select: { id: true, title: true } } } },
} satisfies Prisma.OfferInclude;

export const dealInclude = {
  startup: { select: { id: true, slug: true, name: true } },
  supporter: {
    select: { id: true, status: true, supporterProfile: { select: { displayName: true } } },
  },
  founder: {
    select: { id: true, status: true, founderProfile: { select: { displayName: true } } },
  },
  offers: { include: offerInclude, orderBy: { revision: 'asc' } },
  events: { orderBy: [{ createdAt: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.DealInclude;

export type DealRow = Prisma.DealGetPayload<{ include: typeof dealInclude }>;
type OfferRow = DealRow['offers'][number];

export function toOfferView(offer: OfferRow): OfferView {
  return {
    id: offer.id,
    revision: offer.revision,
    previousOfferId: offer.previousOfferId,
    createdById: offer.createdById,
    recipientId: offer.recipientId,
    fundingType: offer.fundingType,
    amountMinor: minor(offer.amountMinor),
    currency: offer.currency as OfferView['currency'],
    purpose: offer.purpose,
    conditions: offer.conditions,
    message: offer.message,
    respondBy: isoOrNull(offer.respondBy),
    status: offer.status,
    respondedAt: isoOrNull(offer.respondedAt),
    createdAt: iso(offer.createdAt),
    milestones: offer.milestones.map((m) => m.milestone),
  };
}

export type DealActor = 'supporter' | 'founder';

export const actorOf = (row: { supporterId: string }, userId: string): DealActor =>
  row.supporterId === userId ? 'supporter' : 'founder';

export function latestOfferOf(row: DealRow): OfferRow {
  const byId = (id: string | null) =>
    id === null ? undefined : row.offers.find((o) => o.id === id);
  const offer =
    byId(row.currentOfferId) ?? byId(row.acceptedOfferId) ?? row.offers[row.offers.length - 1];
  if (offer === undefined) throw new Error(`deal ${row.id} has no offers`);
  return offer;
}

export function offerActionsFor(row: DealRow, userId: string, interactive: boolean): OfferAction[] {
  if (row.status !== 'negotiating' || row.currentOfferId === null) return [];
  const current = row.offers.find((o) => o.id === row.currentOfferId);
  if (current?.status !== 'pending') return [];
  const actor = current.createdById === userId ? 'creator' : 'recipient';
  const actions = availableActions(OFFER_TRANSITIONS, 'pending', actor).filter(
    (a) => a !== 'expire',
  );
  return interactive ? actions : actions.filter((a) => a === 'withdraw' || a === 'decline');
}

export function dealActionsFor(row: DealRow, userId: string): DealAction[] {
  const actor = actorOf(row, userId);
  const actions = availableActions(DEAL_TRANSITIONS, row.status, actor);
  if (row.status !== 'cancellation_requested') return actions;
  const requester = row.cancellationRequestedById === userId;
  return actions.filter((a) =>
    requester
      ? a === 'withdraw_cancellation'
      : a === 'confirm_cancellation' || a === 'reject_cancellation',
  );
}

export function isAwaiting(row: DealRow, userId: string): boolean {
  const actor = actorOf(row, userId);
  switch (row.status) {
    case 'negotiating': {
      const current = row.offers.find((o) => o.id === row.currentOfferId);
      return current?.recipientId === userId;
    }
    case 'accepted':
    case 'receipt_disputed':
      return actor === 'supporter';
    case 'funding_reported':
      return actor === 'founder';
    case 'cancellation_requested':
      return row.cancellationRequestedById !== userId;
    default:
      return false;
  }
}

export function toDealSummary(row: DealRow, userId: string): DealSummary {
  return {
    id: row.id,
    connectionId: row.connectionId,
    status: row.status,
    startup: row.startup,
    supporter: {
      id: row.supporter.id,
      displayName: row.supporter.supporterProfile?.displayName ?? 'Supporter',
    },
    founder: {
      id: row.founder.id,
      displayName: row.founder.founderProfile?.displayName ?? 'Founder',
    },
    latestOffer: toOfferView(latestOfferOf(row)),
    version: row.version,
    viewerRole: actorOf(row, userId),
    awaitingViewer: isAwaiting(row, userId),
    updatedAt: iso(row.updatedAt),
  };
}

export function toDealView(row: DealRow, userId: string, interactive: boolean): DealView {
  return {
    ...toDealSummary(row, userId),
    currentOfferId: row.currentOfferId,
    acceptedOfferId: row.acceptedOfferId,
    offers: row.offers.map(toOfferView),
    events: row.events.map((e) => ({
      id: e.id,
      type: e.type,
      actorId: e.actorId,
      fromStatus: e.fromStatus,
      toStatus: e.toStatus,
      offerId: e.offerId,
      note: e.note,
      createdAt: iso(e.createdAt),
    })),
    cancellation:
      row.status === 'cancellation_requested' &&
      row.cancellationRequestedById !== null &&
      row.cancellationFromStatus !== null
        ? {
            requestedById: row.cancellationRequestedById,
            reason: row.cancellationReason,
            fromStatus: row.cancellationFromStatus,
          }
        : null,
    availableOfferActions: offerActionsFor(row, userId, interactive),
    availableDealActions: dealActionsFor(row, userId),
    fundingReportedAt: isoOrNull(row.fundingReportedAt),
    receiptConfirmedAt: isoOrNull(row.receiptConfirmedAt),
    completedAt: isoOrNull(row.completedAt),
    cancelledAt: isoOrNull(row.cancelledAt),
    interactive,
    createdAt: iso(row.createdAt),
  };
}
