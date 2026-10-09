// @ts-check
import importPlugin from 'eslint-plugin-import';
import tseslint from 'typescript-eslint';

import {
  hardCodedTextFiles,
  hardCodedTextIgnores,
  hardCodedTextSelectors,
} from './apps/web/eslint.i18n.mjs';

const bannedPrismaRawUnsafe =
  'Unsafe raw SQL is banned. Use Prisma query builders or the tagged-template $queryRaw / $executeRaw (parameterised).';

const prismaRawUnsafeSelectors = ['$queryRawUnsafe', '$executeRawUnsafe'].flatMap((name) => [
  { selector: `MemberExpression[property.name='${name}']`, message: bannedPrismaRawUnsafe },
  { selector: `MemberExpression[property.value='${name}']`, message: bannedPrismaRawUnsafe },
]);

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/storage/**',
      '**/uploads/**',
      '**/next-env.d.ts',
      'scripts/fixtures/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      import: importPlugin,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'import/first': 'error',
      'import/newline-after-import': 'error',
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index', 'type'],
          pathGroups: [{ pattern: '@investfund/**', group: 'internal' }],
          pathGroupsExcludedImportTypes: ['builtin'],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'no-restricted-syntax': ['error', ...prismaRawUnsafeSelectors],
    },
  },
  {
    // apps/web: visible UI copy must come from next-intl messages (see apps/web/eslint.i18n.mjs).
    files: hardCodedTextFiles,
    ignores: hardCodedTextIgnores,
    rules: {
      'no-restricted-syntax': ['error', ...prismaRawUnsafeSelectors, ...hardCodedTextSelectors],
    },
  },
  {
    // Plain JavaScript files (config files, scripts) are not part of a TS project.
    files: ['**/*.{js,mjs,cjs}'],
    ...tseslint.configs.disableTypeChecked,
  },
);
