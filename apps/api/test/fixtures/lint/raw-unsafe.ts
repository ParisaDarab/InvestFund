// Lint fixture for P0-DB-01 AC5: linted in place of apps/api/src/core/db/index.ts (see
// src/core/db/__tests__/raw-unsafe-lint.test.ts). Lines 8, 9 and 10 must fail lint.
import type { PrismaClient } from './prisma.js';

declare const prisma: PrismaClient;
const sql = 'SELECT 1';

export const a = prisma.$queryRawUnsafe(sql);
export const b = prisma.$executeRawUnsafe(sql);
export const c = prisma['$queryRawUnsafe'](sql);
export const safe = prisma.$queryRaw`SELECT ${sql}::text`;
