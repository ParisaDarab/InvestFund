/**
 * Operator command: grant or revoke the admin role.
 *
 *   pnpm --filter @investfund/api admin:grant -- --email ops@example.com
 *   pnpm --filter @investfund/api admin:grant -- --email ops@example.com --revoke
 *
 * Requires direct database access (DATABASE_URL), which is the control: no HTTP endpoint can
 * grant admin. An account that has never signed in is provisioned with a placeholder identity
 * that the first Google sign-in with that verified email links. Audited.
 */
import { parseArgs } from 'node:util';

import { loadConfig } from '../core/config/config.js';
import { createPrismaClient } from '../core/db/prisma.js';
import { newId } from '../core/ids/index.js';
import { createLogger } from '../core/logger/logger.js';
import { PENDING_SUB_PREFIX } from '../modules/auth/auth.service.js';
import { recordAudit } from '../modules/shared/audit.js';

async function main(): Promise<void> {
  // `pnpm run x -- --email …` forwards the literal `--`; drop it so the flags parse.
  const argv = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args: argv,
    options: { email: { type: 'string' }, revoke: { type: 'boolean', default: false } },
    allowPositionals: true,
  });
  const email = values.email?.trim().toLowerCase();
  if (email === undefined || !/^[^\s@]+@[^\s@]+$/.test(email)) {
    throw new Error('Usage: admin:grant -- --email <address> [--revoke]');
  }
  const config = loadConfig();
  const logger = createLogger({ level: 'warn', service: 'cli' });
  const prisma = createPrismaClient({ url: config.database.url, logger });
  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (values.revoke) {
      if (user?.role !== 'admin') throw new Error('That account is not an admin.');
      await prisma.user.update({ where: { id: user.id }, data: { role: null, onboardedAt: null } });
      await recordAudit(prisma, {
        actorId: null,
        action: 'cli.admin_revoked',
        entityType: 'user',
        entityId: user.id,
      });
      process.stdout.write('admin role revoked; the user will choose a role at next sign-in\n');
      return;
    }
    if (user === null) {
      const id = newId();
      await prisma.user.create({
        data: {
          id,
          email,
          googleSub: `${PENDING_SUB_PREFIX}${id}`,
          name: 'Administrator',
          role: 'admin',
          onboardedAt: new Date(),
        },
      });
      await recordAudit(prisma, {
        actorId: null,
        action: 'cli.admin_granted',
        entityType: 'user',
        entityId: id,
      });
      process.stdout.write(
        'admin account provisioned; it is linked at the first Google sign-in with this email\n',
      );
      return;
    }
    if (user.role !== null && user.role !== 'admin') {
      throw new Error(`That account is a ${user.role}. Use a separate account for administration.`);
    }
    await prisma.user.update({
      where: { id: user.id },
      data: { role: 'admin', onboardedAt: user.onboardedAt ?? new Date() },
    });
    await recordAudit(prisma, {
      actorId: null,
      action: 'cli.admin_granted',
      entityType: 'user',
      entityId: user.id,
    });
    process.stdout.write('admin role granted\n');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(
    `admin:grant failed: ${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exit(1);
});
