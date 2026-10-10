/** Funding offers, counteroffers and deal outcomes (docs/API.md §6.8). Grants and donations only. */
import { z } from 'zod';

import { DEAL_ACTIONS, DEAL_STATUSES, OFFER_ACTIONS, OFFER_STATUSES } from '../domain/workflows.js';

import { AmountMinor, Currency, Cursor, IsoDateTime, Uuid, cursorPage } from './common.js';
import { StartupRef } from './connections.js';
import {
  FundingTypeSchema,
  PersonSummary,
  PositiveAmountMinor,
  optionalText,
  requiredText,
} from './fields.js';

export const DealStatusSchema = z.enum(DEAL_STATUSES).meta({ id: 'DealStatus' });
export const OfferStatusSchema = z.enum(OFFER_STATUSES).meta({ id: 'OfferStatus' });
export const DealActionSchema = z.enum(DEAL_ACTIONS).meta({ id: 'DealAction' });

/** Proposed terms. Currency must equal the startup's currency (checked by the service). */
export const OfferTerms = z
  .strictObject({
    fundingType: FundingTypeSchema,
    amountMinor: PositiveAmountMinor,
    currency: Currency,
    purpose: requiredText(2000),
    conditions: optionalText(4000),
    message: optionalText(2000),
    /** Optional response deadline; must be in the future. */
    respondBy: IsoDateTime.nullable().optional(),
    milestoneIds: z.array(Uuid).max(20).default([]),
  })
  .meta({ id: 'OfferTerms' });
export type OfferTerms = z.input<typeof OfferTerms>;

/** `POST /deals`: open a negotiation on an accepted connection with a first offer. */
export const CreateDealRequest = z
  .strictObject({ connectionId: Uuid, terms: OfferTerms })
  .meta({ id: 'CreateDealRequest' });
export type CreateDealRequest = z.input<typeof CreateDealRequest>;

/**
 * `POST /deals/{id}/offers/{offerId}/respond`. `offerId` must be the deal's current offer, so a
 * response to stale terms is rejected (409) instead of applying to newer ones.
 * - `accept` / `decline`: recipient. `withdraw`: creator.
 * - `counter`: recipient, with new `terms`. `revise`: creator, with new `terms`.
 */
export const RespondToOfferRequest = z
  .strictObject({
    action: z.enum(OFFER_ACTIONS).exclude(['expire']),
    terms: OfferTerms.optional(),
    note: optionalText(1000),
  })
  .superRefine((value, ctx) => {
    const needsTerms = value.action === 'counter' || value.action === 'revise';
    if (needsTerms && value.terms === undefined) {
      ctx.addIssue({ code: 'custom', path: ['terms'], message: 'Terms are required.' });
    }
    if (!needsTerms && value.terms !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['terms'], message: 'Terms are not allowed here.' });
    }
  })
  .meta({ id: 'RespondToOfferRequest' });
export type RespondToOfferRequest = z.input<typeof RespondToOfferRequest>;

/** `POST /deals/{id}/actions`: lifecycle after acceptance. `version` guards stale updates. */
export const DealActionRequest = z
  .strictObject({
    action: DealActionSchema,
    version: z.int().positive(),
    reason: optionalText(1000),
  })
  .meta({ id: 'DealActionRequest' });
export type DealActionRequest = z.input<typeof DealActionRequest>;

export const OfferView = z
  .object({
    id: Uuid,
    revision: z.int(),
    previousOfferId: Uuid.nullable(),
    createdById: Uuid,
    recipientId: Uuid,
    fundingType: FundingTypeSchema,
    amountMinor: AmountMinor,
    currency: Currency,
    purpose: z.string(),
    conditions: z.string().nullable(),
    message: z.string().nullable(),
    respondBy: IsoDateTime.nullable(),
    status: OfferStatusSchema,
    respondedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    milestones: z.array(z.object({ id: Uuid, title: z.string() })),
  })
  .meta({ id: 'Offer' });
export type OfferView = z.infer<typeof OfferView>;

export const DealEventView = z
  .object({
    id: Uuid,
    type: z.string(),
    actorId: Uuid.nullable(),
    fromStatus: DealStatusSchema.nullable(),
    toStatus: DealStatusSchema,
    offerId: Uuid.nullable(),
    note: z.string().nullable(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'DealEvent' });
export type DealEventView = z.infer<typeof DealEventView>;

export const DealSummary = z
  .object({
    id: Uuid,
    connectionId: Uuid,
    status: DealStatusSchema,
    startup: StartupRef,
    supporter: PersonSummary,
    founder: PersonSummary,
    /** Latest terms: the pending offer, or the accepted one, or the last revision. */
    latestOffer: OfferView,
    version: z.int(),
    viewerRole: z.enum(['supporter', 'founder']),
    /** True when the viewer must respond or act next. */
    awaitingViewer: z.boolean(),
    updatedAt: IsoDateTime,
  })
  .meta({ id: 'DealSummary' });
export type DealSummary = z.infer<typeof DealSummary>;

export const DealView = DealSummary.extend({
  currentOfferId: Uuid.nullable(),
  acceptedOfferId: Uuid.nullable(),
  offers: z.array(OfferView).meta({ description: 'Every revision, oldest first.' }),
  events: z.array(DealEventView),
  cancellation: z
    .object({
      requestedById: Uuid,
      reason: z.string().nullable(),
      fromStatus: DealStatusSchema,
    })
    .nullable(),
  availableOfferActions: z.array(z.enum(OFFER_ACTIONS)),
  availableDealActions: z.array(DealActionSchema),
  fundingReportedAt: IsoDateTime.nullable(),
  receiptConfirmedAt: IsoDateTime.nullable(),
  completedAt: IsoDateTime.nullable(),
  cancelledAt: IsoDateTime.nullable(),
  /** False when a block or suspension stops further negotiation. */
  interactive: z.boolean(),
  createdAt: IsoDateTime,
}).meta({ id: 'Deal' });
export type DealView = z.infer<typeof DealView>;

export const DealListQuery = z.strictObject({
  status: z.enum(['open', 'closed', 'all']).default('all'),
  connectionId: Uuid.optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const DealPage = cursorPage(DealSummary).meta({ id: 'DealPage' });
export type DealPage = z.infer<typeof DealPage>;
