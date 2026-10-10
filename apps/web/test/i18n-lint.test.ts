import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { hardCodedTextSelectors } from '../eslint.i18n.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/i18n/${name}`, import.meta.url), 'utf8');

function lintTsx(code: string) {
  const linter = new Linter({ configType: 'flat' });
  return linter.verify(
    code,
    [
      {
        files: ['**/*.tsx'],
        languageOptions: {
          parser: tseslint.parser,
          parserOptions: { ecmaFeatures: { jsx: true } },
        },
        rules: { 'no-restricted-syntax': ['error', ...hardCodedTextSelectors] },
      },
    ],
    { filename: 'fixture.tsx' },
  );
}

describe('i18n guard: no hard-coded JSX text', () => {
  it('flags every kind of hard-coded copy in the fixture', () => {
    const messages = lintTsx(fixture('hardcoded.tsx'));
    expect(messages.every((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
    expect(messages.map((m) => m.line).sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9]);
    expect(messages[0]?.message).toContain('en-GB.json');
  });

  it('accepts copy that comes from next-intl', () => {
    expect(lintTsx(fixture('translated.tsx'))).toEqual([]);
  });

  // Loading the full repository config (type-aware typescript-eslint) is slow on a cold start.
  it(
    'is enabled for apps/web components and pages in the repository ESLint config',
    { timeout: 30_000 },
    async () => {
      const eslint = new ESLint({ cwd: repoRoot });
      const files = [
        'apps/web/src/app/[locale]/(marketing)/page.tsx',
        'apps/web/src/components/feedback/not-found-state.tsx',
      ];
      for (const file of files) {
        const config = (await eslint.calculateConfigForFile(file)) as {
          rules: Record<string, unknown[]>;
        };
        const selectors = (config.rules['no-restricted-syntax'] ?? []).slice(1) as {
          selector: string;
        }[];
        for (const { selector } of hardCodedTextSelectors) {
          expect(selectors.map((s) => s.selector)).toContain(selector);
        }
      }
    },
  );
});
