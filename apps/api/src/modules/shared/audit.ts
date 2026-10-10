/**
 * Audit trail for sensitive actions (offers, permissions, moderation, sign-in). Metadata must be
 * non-sensitive: identifiers and statuses, never message text, document content or tokens.
 */
import { newId } from '../../core/ids/index.js';

import type { PrismaClient, Prisma } from '../../core/db/prisma.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';

export interface AuditInput {
  readonly actorId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null;
  readonly metadata?: Prisma.InputJsonObject;
}

export async function recordAudit(
  db: TransactionClient | PrismaClient,
  input: AuditInput,
): Promise<void> {
  await db.auditEvent.create({
    data: {
      id: newId(),
      actorId: input.actorId,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      metadata: input.metadata ?? {},
    },
  });
}
