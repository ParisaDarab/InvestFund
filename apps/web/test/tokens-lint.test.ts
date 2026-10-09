import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ESLint, Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { rawColourSelectors } from '../eslint.tokens.mjs';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/tokens/${name}`, import.meta.url), 'utf8');

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
        rules: { 'no-restricted-syntax': ['error', ...rawColourSelectors] },
      },
    ],
    { filename: 'fixture.tsx' },
  );
}

describe('design-token guard: no raw colours in components and pages', () => {
  it('flags hex values and Tailwind palette classes', () => {
    const messages = lintTsx(fixture('raw-colours.tsx'));
    expect(messages.every((m) => m.ruleId === 'no-restricted-syntax')).toBe(true);
    expect(messages.map((m) => m.line).sort((a, b) => a - b)).toEqual([2, 5, 6, 7, 7, 7, 8]);
    expect(messages.find((m) => m.line === 2)?.message).toContain('Raw colour value');
    expect(messages.find((m) => m.line === 5)?.message).toContain('Tailwind palette colour');
  });

  it.each([
    ['className="bg-zinc-900"', '<div className="bg-zinc-900" />'],
    ['#34D399', 'const c = "#34D399";'],
  ])('fails on %s (acceptance criterion 3)', (_label, code) => {
    expect(lintTsx(code)).toHaveLength(1);
  });

  it('accepts semantic tokens, anchors and look-alike class names', () => {
    expect(lintTsx(fixture('semantic-tokens.tsx'))).toEqual([]);
  });

  // Loading the full repository config (type-aware typescript-eslint) is slow on a cold start.
  it(
    'is enabled for apps/web components and pages, alongside the i18n guard',
    { timeout: 30_000 },
    async () => {
      const eslint = new ESLint({ cwd: repoRoot });
      const files = [
        'apps/web/src/components/ui/button.tsx',
        'apps/web/src/components/ui/button-variants.ts',
        'apps/web/src/app/[locale]/(marketing)/page.tsx',
      ];
      for (const file of files) {
        const config = (await eslint.calculateConfigForFile(file)) as {
          rules: Record<string, unknown[]>;
        };
        const selectors = (config.rules['no-restricted-syntax'] ?? [])
          .slice(1)
          .map((s) => (s as { selector: string }).selector);
        for (const { selector } of rawColourSelectors) expect(selectors).toContain(selector);
      }
    },
  );
});
