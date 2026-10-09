// @ts-check
// i18n guard for apps/web: visible UI copy must come from src/messages/en-GB.json via next-intl.
// Wired into the root eslint.config.mjs for `apps/web/src/**/*.tsx` through `no-restricted-syntax`
// (core ESLint, no extra plugin). Tested in test/i18n-lint.test.ts.

const message =
  'Hard-coded UI text. Put the copy in src/messages/en-GB.json and render it with next-intl (t(...)).';

/** Attributes whose values are read by users or assistive technology. */
const textAttributes = ['alt', 'title', 'placeholder', 'label', 'aria-label', 'aria-description'];
const textAttributePattern = `/^(${textAttributes.join('|')})$/`;

/** Any string containing a letter counts as copy; punctuation and whitespace alone do not. */
const letter = '/\\p{L}/u';

/** @type {{ selector: string; message: string }[]} */
export const hardCodedTextSelectors = [
  // <p>Hello</p>
  { selector: `JSXText[value=${letter}]`, message },
  // <p>{'Hello'}</p>
  { selector: `JSXElement > JSXExpressionContainer > Literal[value=${letter}]`, message },
  // <p>{`Hello`}</p>
  {
    selector: `JSXElement > JSXExpressionContainer > TemplateLiteral > TemplateElement[value.raw=${letter}]`,
    message,
  },
  // <img alt="Hello" />, <input placeholder={'Hello'} />
  {
    selector: `JSXAttribute[name.name=${textAttributePattern}] > Literal[value=${letter}]`,
    message,
  },
  {
    selector: `JSXAttribute[name.name=${textAttributePattern}] > JSXExpressionContainer > Literal[value=${letter}]`,
    message,
  },
];

/** Files the guard applies to (relative to the repository root). */
export const hardCodedTextFiles = ['apps/web/src/**/*.tsx'];
export const hardCodedTextIgnores = ['apps/web/src/**/*.test.tsx'];
