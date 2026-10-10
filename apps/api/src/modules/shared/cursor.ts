/**
 * Opaque pagination cursors (base64url JSON). Offset cursors serve ranked or multi-key sorts;
 * keyset cursors (`createdAt` + `id`) serve append-mostly feeds such as messages. A malformed
 * cursor is a 400 `validation-error`, never a 500.
 */
import { z } from 'zod';

import { ValidationError } from '../../core/errors/domain-errors.js';

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decode<T>(cursor: string, schema: z.ZodType<T>): T {
  try {
    const parsed = schema.safeParse(JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')));
    if (parsed.success) return parsed.data;
  } catch {
    // fall through
  }
  throw new ValidationError('The cursor is invalid.', {
    errors: [{ path: 'query.cursor', code: 'invalid_cursor', message: 'Invalid cursor.' }],
  });
}

const OffsetCursor = z.object({ o: z.int().min(0).max(100_000) });

export const offsetCursor = {
  encode: (offset: number): string => encode({ o: offset }),
  decode: (cursor: string | undefined): number =>
    cursor === undefined ? 0 : decode(cursor, OffsetCursor).o,
};

const KeysetCursor = z.object({ t: z.iso.datetime(), i: z.uuid() });

export interface Keyset {
  readonly createdAt: Date;
  readonly id: string;
}

export const keysetCursor = {
  encode: (key: Keyset): string => encode({ t: key.createdAt.toISOString(), i: key.id }),
  decode: (cursor: string | undefined): Keyset | null => {
    if (cursor === undefined) return null;
    const value = decode(cursor, KeysetCursor);
    return { createdAt: new Date(value.t), id: value.i };
  },
};

/** Splits a `limit + 1` result into a page and whether more rows exist. */
export function takePage<T>(rows: readonly T[], limit: number): { page: T[]; hasMore: boolean } {
  return { page: rows.slice(0, limit), hasMore: rows.length > limit };
}
