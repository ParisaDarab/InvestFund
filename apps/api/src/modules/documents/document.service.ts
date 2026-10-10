/**
 * Confidential startup documents (docs/DOMAIN_RULES.md §5).
 *
 * Access rule, checked on every list and download (a hard-to-guess URL is never enough):
 * - the startup's founder always has access;
 * - a supporter has access only with an ACCEPTED connection to that startup, no block between
 *   them, both accounts active, and either `all_connections` visibility or an explicit grant.
 * Binaries live in private storage under random keys; only metadata is in PostgreSQL.
 */
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';

import type { DocumentView } from '@investfund/shared';

import {
  BusinessRuleError,
  NotFoundError,
  ValidationError,
} from '../../core/errors/domain-errors.js';
import { newId } from '../../core/ids/index.js';
import { Effects, type EventPublisher } from '../notifications/effects.js';
import { recordAudit } from '../shared/audit.js';
import { isBlockedBetween } from '../shared/policies.js';
import { iso } from '../shared/serialize.js';

import { checkUpload } from './file-validation.js';

import type { PrismaClient } from '../../core/db/prisma.js';
import type { UnitOfWork } from '../../core/db/unit-of-work.js';
import type { StorageProvider } from '../../core/file-storage/storage-provider.js';
import type { Logger } from '../../core/logger/logger.js';
import type { Notifier } from '../notifications/notifier.js';

export const MAX_DOCUMENTS_PER_STARTUP = 50;

type DocumentRow = NonNullable<
  Awaited<ReturnType<PrismaClient['startupDocument']['findUnique']>>
> & {
  grants?: { connectionId: string }[];
};

const toView = (row: DocumentRow, owner: boolean): DocumentView => ({
  id: row.id,
  startupId: row.startupId,
  fileName: row.fileName,
  contentType: row.contentType,
  sizeBytes: row.sizeBytes,
  visibility: row.visibility,
  ...(owner ? { grantedConnectionIds: (row.grants ?? []).map((g) => g.connectionId) } : {}),
  createdAt: iso(row.createdAt),
});

export class DocumentService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly uow: UnitOfWork,
    private readonly storage: StorageProvider,
    private readonly notifier: Notifier,
    private readonly publisher: EventPublisher,
    private readonly logger: Logger,
  ) {}

  async upload(
    founderId: string,
    startupId: string,
    input: {
      fileName: string;
      visibility: 'all_connections' | 'selected';
      contentType: string | undefined;
      data: Buffer;
    },
  ): Promise<DocumentView> {
    await this.ownedStartup(founderId, startupId);
    const check = checkUpload(input.contentType, input.fileName, input.data);
    if (!check.ok) {
      throw new ValidationError(check.reason, {
        errors: [{ path: 'body', code: 'invalid_file', message: check.reason }],
      });
    }
    const count = await this.prisma.startupDocument.count({
      where: { startupId, deletedAt: null },
    });
    if (count >= MAX_DOCUMENTS_PER_STARTUP) {
      throw new BusinessRuleError('This startup has reached its document limit.', {
        slug: 'quota-exceeded',
      });
    }
    const stored = await this.storage.put(Readable.from(input.data));
    const id = newId();
    try {
      const row = await this.uow.run(async (tx) => {
        const created = await tx.startupDocument.create({
          data: {
            id,
            startupId,
            uploadedById: founderId,
            storageKey: stored.key,
            fileName: check.fileName,
            contentType: check.contentType,
            sizeBytes: stored.sizeBytes,
            sha256: createHash('sha256').update(input.data).digest('hex'),
            visibility: input.visibility,
          },
          include: { grants: { select: { connectionId: true } } },
        });
        await recordAudit(tx, {
          actorId: founderId,
          action: 'document.uploaded',
          entityType: 'document',
          entityId: id,
          metadata: { startupId, visibility: input.visibility },
        });
        return created;
      });
      return toView(row, true);
    } catch (error) {
      await this.storage.delete(stored.key).catch(() => undefined);
      throw error;
    }
  }

  async list(userId: string, startupId: string): Promise<DocumentView[]> {
    const startup = await this.prisma.startup.findUnique({
      where: { id: startupId },
      select: { founderId: true },
    });
    if (startup === null) throw new NotFoundError('The startup was not found.');
    const owner = startup.founderId === userId;
    if (!owner && (await this.connectionFor(userId, startupId, startup.founderId)) === null) {
      // Same answer whether the startup has documents or the caller lacks access.
      return [];
    }
    const connection = owner
      ? null
      : await this.connectionFor(userId, startupId, startup.founderId);
    const rows = await this.prisma.startupDocument.findMany({
      where: {
        startupId,
        deletedAt: null,
        ...(owner
          ? {}
          : {
              OR: [
                { visibility: 'all_connections' },
                { grants: { some: { connectionId: connection?.id ?? '' } } },
              ],
            }),
      },
      include: { grants: { select: { connectionId: true } } },
      orderBy: [{ createdAt: 'desc' }],
    });
    return rows.map((row) => toView(row, owner));
  }

  /** Authorises a download and returns the stream and safe metadata. */
  async download(userId: string, documentId: string) {
    const doc = await this.prisma.startupDocument.findUnique({
      where: { id: documentId },
      include: {
        startup: { select: { founderId: true } },
        grants: { select: { connectionId: true } },
      },
    });
    if (doc?.deletedAt !== null) throw new NotFoundError('The document was not found.');
    const owner = doc.startup.founderId === userId;
    if (!owner) {
      const connection = await this.connectionFor(userId, doc.startupId, doc.startup.founderId);
      const granted =
        doc.visibility === 'all_connections' ||
        (connection !== null && doc.grants.some((g) => g.connectionId === connection.id));
      if (connection === null || !granted) throw new NotFoundError('The document was not found.');
    }
    const stream = await this.storage.get(doc.storageKey);
    await recordAudit(this.prisma, {
      actorId: userId,
      action: 'document.downloaded',
      entityType: 'document',
      entityId: doc.id,
    });
    return {
      stream,
      fileName: doc.fileName,
      contentType: doc.contentType,
      sizeBytes: doc.sizeBytes,
    };
  }

  async updateSharing(
    founderId: string,
    documentId: string,
    visibility: 'all_connections' | 'selected',
    connectionIds: readonly string[],
  ): Promise<DocumentView> {
    const doc = await this.ownedDocument(founderId, documentId);
    const unique = [...new Set(connectionIds)];
    const connections = await this.prisma.connection.findMany({
      where: { id: { in: unique }, startupId: doc.startupId, status: 'accepted' },
      select: { id: true, supporterId: true, startup: { select: { name: true } } },
    });
    if (connections.length !== unique.length) {
      throw new ValidationError(
        'Documents can only be shared with accepted connections of this startup.',
        {
          errors: [
            {
              path: 'body.connectionIds',
              code: 'invalid_connection',
              message: 'Unknown connection.',
            },
          ],
        },
      );
    }
    const before = new Set(doc.grants.map((g) => g.connectionId));
    const effects = new Effects();
    const row = await this.uow.run(async (tx) => {
      await tx.documentGrant.deleteMany({ where: { documentId } });
      if (visibility === 'selected' && connections.length > 0) {
        await tx.documentGrant.createMany({
          data: connections.map((c) => ({ documentId, connectionId: c.id, userId: c.supporterId })),
        });
      }
      const updated = await tx.startupDocument.update({
        where: { id: documentId },
        data: { visibility },
        include: { grants: { select: { connectionId: true } } },
      });
      await recordAudit(tx, {
        actorId: founderId,
        action: 'document.sharing_changed',
        entityType: 'document',
        entityId: documentId,
        metadata: { visibility, grants: visibility === 'selected' ? connections.length : 0 },
      });
      for (const c of connections) {
        if (visibility === 'selected' && !before.has(c.id)) {
          await this.notifier.notify(tx, effects, {
            userId: c.supporterId,
            type: 'document_shared',
            data: { startupName: c.startup.name },
            link: `/app/connections`,
            dedupeKey: `document_shared:${documentId}:${c.id}`,
          });
        }
      }
      return updated;
    });
    await effects.flush(this.publisher, this.logger);
    return toView(row, true);
  }

  async remove(founderId: string, documentId: string): Promise<void> {
    const doc = await this.ownedDocument(founderId, documentId);
    await this.uow.run(async (tx) => {
      await tx.startupDocument.update({
        where: { id: documentId },
        data: { deletedAt: new Date() },
      });
      await tx.documentGrant.deleteMany({ where: { documentId } });
      await recordAudit(tx, {
        actorId: founderId,
        action: 'document.deleted',
        entityType: 'document',
        entityId: documentId,
      });
    });
    await this.storage.delete(doc.storageKey);
  }

  private async ownedStartup(founderId: string, startupId: string) {
    const startup = await this.prisma.startup.findUnique({
      where: { id: startupId },
      select: { founderId: true },
    });
    if (startup?.founderId !== founderId) throw new NotFoundError('The startup was not found.');
    return startup;
  }

  private async ownedDocument(founderId: string, documentId: string) {
    const doc = await this.prisma.startupDocument.findUnique({
      where: { id: documentId },
      include: {
        startup: { select: { founderId: true } },
        grants: { select: { connectionId: true } },
      },
    });
    if (doc?.deletedAt !== null || doc.startup.founderId !== founderId) {
      throw new NotFoundError('The document was not found.');
    }
    return doc;
  }

  /** The caller's accepted, unblocked connection to the startup with both accounts active. */
  private async connectionFor(userId: string, startupId: string, founderId: string) {
    const connection = await this.prisma.connection.findFirst({
      where: {
        startupId,
        supporterId: userId,
        status: 'accepted',
        supporter: { status: 'active' },
        founder: { status: 'active' },
      },
      select: { id: true },
    });
    if (connection === null) return null;
    if (await isBlockedBetween(this.prisma, userId, founderId)) return null;
    return connection;
  }
}
