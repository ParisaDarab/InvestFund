/**
 * Refresh sessions (rotating opaque tokens in an httpOnly cookie).
 *
 * - Only the SHA-256 of a token is stored. Each refresh rotates the token in place and keeps the
 *   previous hash.
 * - Presenting the previous token shortly after rotation (two tabs refreshing at once) mints an
 *   access token without rotating again. Presenting it later is treated as token theft: the
 *   session is revoked (reuse detection).
 * - Suspended users cannot refresh.
 */
import { createHash, randomBytes } from 'node:crypto';

import { newId } from '../../core/ids/index.js';
import { recordAudit } from '../shared/audit.js';

import type { PrismaClient } from '../../core/db/prisma.js';

/** How long a just-rotated token stays usable (concurrent refreshes). */
export const ROTATION_GRACE_MS = 30_000;

export const hashToken = (token: string): string =>
  createHash('sha256').update(token, 'utf8').digest('hex');

const newToken = (): string => randomBytes(32).toString('base64url');

export type RefreshOutcome =
  | { readonly kind: 'rotated'; readonly userId: string; readonly token: string }
  | { readonly kind: 'grace'; readonly userId: string }
  | { readonly kind: 'invalid' };

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly ttlDays: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  get ttlSeconds(): number {
    return this.ttlDays * 24 * 60 * 60;
  }

  async create(userId: string): Promise<string> {
    const token = newToken();
    const id = newId();
    await this.prisma.session.create({
      data: {
        id,
        userId,
        familyId: id,
        tokenHash: hashToken(token),
        expiresAt: new Date(this.now().getTime() + this.ttlSeconds * 1000),
      },
    });
    return token;
  }

  async refresh(token: string): Promise<RefreshOutcome> {
    const hash = hashToken(token);
    const now = this.now();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hash },
      include: { user: { select: { status: true } } },
    });
    if (session !== null) {
      if (session.revokedAt !== null || session.expiresAt <= now) return { kind: 'invalid' };
      if (session.user.status !== 'active') return { kind: 'invalid' };
      const next = newToken();
      // Conditional on the old hash: of two concurrent rotations only one wins.
      const { count } = await this.prisma.session.updateMany({
        where: { id: session.id, tokenHash: hash, revokedAt: null },
        data: { tokenHash: hashToken(next), previousHash: hash, rotatedAt: now },
      });
      if (count === 1) return { kind: 'rotated', userId: session.userId, token: next };
      return { kind: 'grace', userId: session.userId };
    }

    const previous = await this.prisma.session.findFirst({
      where: { previousHash: hash },
      include: { user: { select: { status: true } } },
    });
    if (previous?.revokedAt !== null) return { kind: 'invalid' };
    const rotatedAt = previous.rotatedAt?.getTime() ?? 0;
    if (now.getTime() - rotatedAt <= ROTATION_GRACE_MS && previous.user.status === 'active') {
      return { kind: 'grace', userId: previous.userId };
    }
    await this.prisma.session.updateMany({
      where: { familyId: previous.familyId, revokedAt: null },
      data: { revokedAt: now },
    });
    await recordAudit(this.prisma, {
      actorId: previous.userId,
      action: 'auth.refresh_token_reuse',
      entityType: 'session',
      entityId: previous.id,
    });
    return { kind: 'invalid' };
  }

  async revoke(token: string): Promise<void> {
    const hash = hashToken(token);
    await this.prisma.session.updateMany({
      where: { OR: [{ tokenHash: hash }, { previousHash: hash }], revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.now() },
    });
  }
}
