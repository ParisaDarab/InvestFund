import { Prisma } from '../../core/db/prisma.js';

/** True for a unique-constraint violation (including partial unique indexes). */
export function isUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}
