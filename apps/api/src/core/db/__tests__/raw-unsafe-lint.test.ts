/**
 * AC5: the repository lint config bans Prisma's unsafe raw SQL APIs. The fixture is linted with
 * the real root config (type-aware) in place of an existing source file, because the TypeScript
 * project service only lints files that belong to a tsconfig project.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../../../', import.meta.url));
const fixture = readFileSync(
  new URL('../../../../test/fixtures/lint/raw-unsafe.ts', import.meta.url),
  'utf8',
);

// Loading the full repository config (type-aware typescript-eslint) is slow on a cold start.
describe('lint: $queryRawUnsafe / $executeRawUnsafe are banned (AC5)', { timeout: 60_000 }, () => {
  it('fails lint on each unsafe call and accepts the tagged-template $queryRaw', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const [result] = await eslint.lintText(fixture, {
      filePath: `${repoRoot}apps/api/src/core/db/index.ts`,
    });
    const banned = (result?.messages ?? []).filter((m) => m.ruleId === 'no-restricted-syntax');
    expect(banned.map((m) => m.line)).toEqual([8, 9, 10]);
    for (const message of banned) {
      expect(message.severity).toBe(2);
      expect(message.message).toContain('Unsafe raw SQL is banned');
    }
    // The tagged template (parameterised) on line 11 is allowed.
    expect((result?.messages ?? []).filter((m) => m.line === 11)).toEqual([]);
  });

  it('applies to every TypeScript workspace package', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    for (const file of [
      'apps/api/src/app.ts',
      'packages/shared/src/index.ts',
      'packages/test-utils/src/db.ts',
      'apps/web/src/components/ui/button.tsx',
    ]) {
      const config = (await eslint.calculateConfigForFile(file)) as {
        rules: Record<string, unknown[]>;
      };
      const selectors = (config.rules['no-restricted-syntax'] ?? [])
        .slice(1)
        .map((entry) => (entry as { selector: string }).selector);
      expect(selectors).toContain("MemberExpression[property.name='$queryRawUnsafe']");
      expect(selectors).toContain("MemberExpression[property.value='$executeRawUnsafe']");
    }
  });
});
