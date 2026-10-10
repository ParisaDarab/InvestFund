/** Blocking, reporting and administration contracts (docs/API.md §6.11-§6.12). */
import { z } from 'zod';

import { REPORT_ACTIONS, REPORT_TARGET_TYPES } from '../domain/taxonomy.js';

import { Cursor, IsoDateTime, Uuid, cursorPage } from './common.js';
import { PersonSummary, ReportCategorySchema, optionalText } from './fields.js';

export const BlockRequest = z.strictObject({ userId: Uuid }).meta({ id: 'BlockRequest' });

export const BlockedUser = z
  .object({ user: PersonSummary, createdAt: IsoDateTime })
  .meta({ id: 'BlockedUser' });
export const BlockList = z.object({ data: z.array(BlockedUser) }).meta({ id: 'BlockList' });

export const ReportTargetTypeSchema = z.enum(REPORT_TARGET_TYPES).meta({ id: 'ReportTargetType' });
export const ReportStatusSchema = z
  .enum(['open', 'resolved', 'dismissed'])
  .meta({ id: 'ReportStatus' });
export const ReportActionSchema = z.enum(REPORT_ACTIONS).meta({ id: 'ReportAction' });

export const CreateReportRequest = z
  .strictObject({
    targetType: ReportTargetTypeSchema,
    targetId: Uuid,
    category: ReportCategorySchema,
    details: optionalText(2000),
  })
  .meta({ id: 'CreateReportRequest' });
export type CreateReportRequest = z.input<typeof CreateReportRequest>;

export const ReportReceipt = z
  .object({ id: Uuid, status: ReportStatusSchema, createdAt: IsoDateTime })
  .meta({ id: 'ReportReceipt' });

export const AdminReport = z
  .object({
    id: Uuid,
    targetType: ReportTargetTypeSchema,
    target: z.object({
      id: Uuid,
      label: z.string(),
      /** User email or startup slug, for review. */
      detail: z.string(),
      status: z.string(),
    }),
    category: ReportCategorySchema,
    details: z.string().nullable(),
    status: ReportStatusSchema,
    reporter: PersonSummary,
    action: ReportActionSchema.nullable(),
    resolutionNote: z.string().nullable(),
    reviewedBy: PersonSummary.nullable(),
    reviewedAt: IsoDateTime.nullable(),
    createdAt: IsoDateTime,
    /** Other reports about the same target. */
    relatedOpenReports: z.int().min(0),
  })
  .meta({ id: 'AdminReport' });
export type AdminReport = z.infer<typeof AdminReport>;

export const AdminReportQuery = z.strictObject({
  status: ReportStatusSchema.optional(),
  cursor: Cursor.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export const AdminReportPage = cursorPage(AdminReport).meta({ id: 'AdminReportPage' });
export type AdminReportPage = z.infer<typeof AdminReportPage>;

export const ResolveReportRequest = z
  .strictObject({
    status: z.enum(['resolved', 'dismissed']),
    action: ReportActionSchema.default('none'),
    note: optionalText(2000),
  })
  .refine((value) => value.status === 'resolved' || value.action === 'none', {
    error: 'A dismissed report cannot carry an action.',
    path: ['action'],
  })
  .meta({ id: 'ResolveReportRequest' });
export type ResolveReportRequest = z.input<typeof ResolveReportRequest>;

/** Basic operational overview for administrators (real counts, no fabricated statistics). */
export const AdminOverview = z
  .object({
    users: z.object({ total: z.int(), founders: z.int(), supporters: z.int(), suspended: z.int() }),
    startups: z.object({ published: z.int(), draft: z.int(), archived: z.int() }),
    connections: z.object({ pending: z.int(), accepted: z.int() }),
    deals: z.object({
      negotiating: z.int(),
      accepted: z.int(),
      completed: z.int(),
      cancelled: z.int(),
    }),
    reports: z.object({ open: z.int() }),
    emails: z.object({ pending: z.int(), failed: z.int() }),
  })
  .meta({ id: 'AdminOverview' });
export type AdminOverview = z.infer<typeof AdminOverview>;

export const AdminUserActionRequest = z
  .strictObject({ action: z.enum(['suspend', 'reinstate']), note: optionalText(1000) })
  .meta({ id: 'AdminUserActionRequest' });
