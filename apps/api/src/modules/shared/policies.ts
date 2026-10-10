/**
 * Cross-cutting authorisation policies (docs/DOMAIN_RULES.md §6).
 *
 * Blocking policy: if either user blocked the other, neither can request a connection,
 * send a message, make or answer an offer, or download the other's documents. Existing records
 * stay visible to both as history, and funding outcomes that were already agreed can still be
 * reported, confirmed or cancelled so they can be closed honestly.
 */
import type { PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';

type Db = TransactionClient | PrismaClient;

export async function isBlockedBetween(db: Db, a: string, b: string): Promise<boolean> {
  const count = await db.userBlock.count({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
  });
  return count > 0;
}

/** Users that `userId` blocked or was blocked by. */
export async function blockedUserIds(db: Db, userId: string): Promise<string[]> {
  const rows = await db.userBlock.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return [
    ...new Set(rows.map((row) => (row.blockerId === userId ? row.blockedId : row.blockerId))),
  ];
}

export async function isActiveUser(db: Db, userId: string): Promise<boolean> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
  return user?.status === 'active';
}
