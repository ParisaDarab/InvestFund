// @ts-check
// Design-token guard for apps/web: components and pages use the semantic colour tokens from
// src/styles/globals.css (bg-background, text-muted-foreground, ...), never raw colours.
// Wired into the root eslint.config.mjs through `no-restricted-syntax` (core ESLint, no extra
// plugin). Tested in test/tokens-lint.test.ts.

const hexMessage =
  'Raw colour value. Use a semantic design token class (bg-background, text-primary, ...) from src/styles/globals.css.';
const paletteMessage =
  'Tailwind palette colour class. Use a semantic design token class (bg-background, text-muted-foreground, ...) instead.';

/** `#rgb`, `#rgba`, `#rrggbb` and `#rrggbbaa`, not followed by another word character. */
const hex = '/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?![0-9a-zA-Z_-])/';

const paletteNames = [
  'slate',
  'gray',
  'zinc',
  'neutral',
  'stone',
  'red',
  'orange',
  'amber',
  'yellow',
  'lime',
  'green',
  'emerald',
  'teal',
  'cyan',
  'sky',
  'blue',
  'indigo',
  'violet',
  'purple',
  'fuchsia',
  'pink',
  'rose',
];
const colourUtilities = [
  'bg',
  'text',
  'border(?:-[trblxyse])?',
  'ring(?:-offset)?',
  'outline',
  'divide',
  'fill',
  'stroke',
  'from',
  'via',
  'to',
  'shadow',
  'inset-shadow',
  'drop-shadow',
  'decoration',
  'accent',
  'caret',
  'placeholder',
];

/** e.g. `bg-zinc-900`, `hover:text-emerald-400/50`, `border-white`, `ring-black`. */
const palette = `/(?:^|[\\s:!])(?:${colourUtilities.join('|')})-(?:(?:${paletteNames.join('|')})-\\d{2,3}|white|black)(?![0-9a-zA-Z_-])/`;

/** @param {string} regex @param {string} message */
const stringSelectors = (regex, message) => [
  // 'bg-zinc-900', "#34D399"
  { selector: `Literal[value=${regex}]`, message },
  // `bg-zinc-900 ${x}`
  { selector: `TemplateElement[value.raw=${regex}]`, message },
];

/** @type {{ selector: string; message: string }[]} */
export const rawColourSelectors = [
  ...stringSelectors(hex, hexMessage),
  ...stringSelectors(palette, paletteMessage),
];

/** Files the guard applies to (relative to the repository root). */
export const rawColourFiles = [
  'apps/web/src/components/**/*.{ts,tsx}',
  'apps/web/src/app/**/*.{ts,tsx}',
];
export const rawColourIgnores = ['apps/web/src/**/*.test.{ts,tsx}'];
