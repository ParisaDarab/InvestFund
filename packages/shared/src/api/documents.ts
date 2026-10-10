/** Confidential document contracts (docs/API.md §6.10). */
import { z } from 'zod';

import { IsoDateTime, Uuid } from './common.js';

export const DOCUMENT_CONTENT_TYPES = {
  'application/pdf': ['pdf'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'text/plain': ['txt'],
} as const satisfies Record<string, readonly string[]>;
export type DocumentContentType = keyof typeof DOCUMENT_CONTENT_TYPES;

/** Largest accepted document, in bytes (10 MB). */
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

export const DocumentVisibilitySchema = z
  .enum(['all_connections', 'selected'])
  .meta({ id: 'DocumentVisibility' });

export const DocumentView = z
  .object({
    id: Uuid,
    startupId: Uuid,
    fileName: z.string(),
    contentType: z.string(),
    sizeBytes: z.int(),
    visibility: DocumentVisibilitySchema,
    /** Owner view only: the connections granted access to a `selected` document. */
    grantedConnectionIds: z.array(Uuid).optional(),
    createdAt: IsoDateTime,
  })
  .meta({ id: 'Document' });
export type DocumentView = z.infer<typeof DocumentView>;

export const DocumentList = z.object({ data: z.array(DocumentView) }).meta({ id: 'DocumentList' });

/** Upload metadata, sent as query parameters with the raw file as the body. */
export const UploadDocumentQuery = z.strictObject({
  fileName: z.string().trim().min(1).max(200),
  visibility: DocumentVisibilitySchema.default('all_connections'),
});

export const UpdateDocumentSharingRequest = z
  .strictObject({
    visibility: DocumentVisibilitySchema,
    connectionIds: z.array(Uuid).max(200).default([]),
  })
  .meta({ id: 'UpdateDocumentSharingRequest' });
export type UpdateDocumentSharingRequest = z.input<typeof UpdateDocumentSharingRequest>;
