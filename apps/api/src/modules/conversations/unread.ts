/**
 * Unread messages are derived, not counted: a message is unread for a participant when it was
 * sent by someone else after the participant's `last_read_at`. Derivation cannot drift under
 * concurrent sends and reads the way a stored counter could.
 */
import type { PrismaClient } from '../../core/db/prisma.js';
import type { TransactionClient } from '../../core/db/unit-of-work.js';

type Db = TransactionClient | PrismaClient;

export async function countUnreadMessages(db: Db, userId: string): Promise<number> {
  const [row] = await db.$queryRaw<[{ count: bigint }]>`
    SELECT count(*)::bigint AS count
    FROM conversation_participants p
    JOIN messages m ON m.conversation_id = p.conversation_id
    WHERE p.user_id = ${userId}::uuid
      AND m.sender_id <> p.user_id
      AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)`;
  return Number(row.count);
}

/** Unread count per conversation for one user. */
export async function unreadByConversation(
  db: Db,
  userId: string,
  conversationIds: readonly string[],
): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map();
  const rows = await db.$queryRaw<{ conversation_id: string; count: bigint }[]>`
    SELECT p.conversation_id, count(m.id)::bigint AS count
    FROM conversation_participants p
    JOIN messages m ON m.conversation_id = p.conversation_id
    WHERE p.user_id = ${userId}::uuid
      AND p.conversation_id = ANY(${conversationIds as string[]}::uuid[])
      AND m.sender_id <> p.user_id
      AND (p.last_read_at IS NULL OR m.created_at > p.last_read_at)
    GROUP BY p.conversation_id`;
  return new Map(rows.map((row) => [row.conversation_id, Number(row.count)]));
}
