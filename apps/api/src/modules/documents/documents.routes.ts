/** Confidential documents (docs/API.md §6.10). Uploads send the raw file as the body. */
import express, { Router } from 'express';
import { z } from 'zod';

import {
  DOCUMENT_CONTENT_TYPES,
  DocumentList,
  DocumentView,
  MAX_DOCUMENT_BYTES,
  UpdateDocumentSharingRequest,
  UploadDocumentQuery,
} from '@investfund/shared';

import { PayloadTooLargeError, ValidationError } from '../../core/errors/domain-errors.js';
import { validate } from '../../core/validation/validate.js';
import { requireUser } from '../shared/actor.js';

import { DocumentService } from './document.service.js';

import type { ModuleContext } from '../context.js';
import type { RequestHandler } from 'express';

const StartupParams = z.strictObject({ startupId: z.uuid() });
const DocParams = z.strictObject({ documentId: z.uuid() });

/** RFC 6266 `Content-Disposition` with an ASCII fallback and an RFC 5987 UTF-8 name. */
export function contentDisposition(fileName: string): string {
  const ascii = fileName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

const rawParser = express.raw({
  type: Object.keys(DOCUMENT_CONTENT_TYPES),
  limit: MAX_DOCUMENT_BYTES,
});

/** Reads the raw file body; body-parser size errors become 413 problem+json. */
const rawUpload: RequestHandler = (req, res, next) => {
  rawParser(req, res, (error?: unknown) => {
    if (error === undefined || error === null) {
      next();
    } else if (
      typeof error === 'object' &&
      (error as { type?: string }).type === 'entity.too.large'
    ) {
      next(
        new PayloadTooLargeError(
          `Documents are limited to ${String(MAX_DOCUMENT_BYTES / 1024 / 1024)} MB.`,
        ),
      );
    } else {
      next(error);
    }
  });
};

export function buildDocumentRoutes(ctx: ModuleContext): {
  startupDocuments: Router;
  documents: Router;
} {
  const service = new DocumentService(
    ctx.prisma,
    ctx.unitOfWork,
    ctx.storage,
    ctx.notifier,
    ctx.realtimeHub,
    ctx.logger,
  );
  const auth = ctx.authGuards.requireAuth();
  const founder = ctx.authGuards.requireRole('founder');
  const limit = ctx.rateLimiter.limit('default');

  const startupDocuments = Router({ mergeParams: true });
  startupDocuments.get('/', auth, limit, validate({ params: StartupParams }), async (req, res) => {
    const user = requireUser(req.user);
    const { startupId } = req.params as z.output<typeof StartupParams>;
    res.setHeader('Cache-Control', 'no-store');
    res.json(DocumentList.parse({ data: await service.list(user.id, startupId) }));
  });
  startupDocuments.post(
    '/',
    founder,
    ctx.rateLimiter.limit('upload'),
    rawUpload,
    validate({ params: StartupParams, query: UploadDocumentQuery }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { startupId } = req.params as z.output<typeof StartupParams>;
      const query = req.query as unknown as z.output<typeof UploadDocumentQuery>;
      if (!Buffer.isBuffer(req.body)) {
        throw new ValidationError('Send the file as the request body with its Content-Type.');
      }
      const created = await service.upload(user.id, startupId, {
        fileName: query.fileName,
        visibility: query.visibility,
        contentType: req.headers['content-type'],
        data: req.body,
      });
      res.status(201).json(DocumentView.parse(created));
    },
  );

  const documents = Router();
  documents.get(
    '/:documentId/download',
    auth,
    limit,
    validate({ params: DocParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { documentId } = req.params as z.output<typeof DocParams>;
      const file = await service.download(user.id, documentId);
      res.setHeader('Content-Type', file.contentType);
      res.setHeader('Content-Length', String(file.sizeBytes));
      res.setHeader('Content-Disposition', contentDisposition(file.fileName));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
      file.stream.on('error', () => res.destroy());
      file.stream.pipe(res);
    },
  );
  documents.put(
    '/:documentId/sharing',
    founder,
    limit,
    validate({ params: DocParams, body: UpdateDocumentSharingRequest }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { documentId } = req.params as z.output<typeof DocParams>;
      const body = req.body as z.output<typeof UpdateDocumentSharingRequest>;
      res.json(
        DocumentView.parse(
          await service.updateSharing(user.id, documentId, body.visibility, body.connectionIds),
        ),
      );
    },
  );
  documents.delete(
    '/:documentId',
    founder,
    limit,
    validate({ params: DocParams }),
    async (req, res) => {
      const user = requireUser(req.user);
      const { documentId } = req.params as z.output<typeof DocParams>;
      await service.remove(user.id, documentId);
      res.status(204).end();
    },
  );

  return { startupDocuments, documents };
}
