import { describe, expect, it } from 'vitest';

import {
  contrastRatio,
  readGlobalsCss,
  tokensFromCss,
  tokensFromDesignSystem,
} from './support/design-tokens';

const css = tokensFromCss();
const spec = tokensFromDesignSystem();
const themes = ['dark', 'light'] as const;

/** WCAG 1.4.3 (text) and 1.4.11 (focus indicator and control boundaries). */
const TEXT_MIN = 4.5;
const NON_TEXT_MIN = 3;

const surfaces = ['background', 'card', 'muted'] as const;
const textTokens = [
  'foreground',
  'muted-foreground',
  'primary',
  'success',
  'warning',
  'destructive',
] as const;

/** Text pairs: every text token on every surface, plus the filled-control pairs. */
const textPairs: [foreground: string, background: string][] = [
  ...textTokens.flatMap((fg) => surfaces.map((bg): [string, string] => [fg, bg])),
  ['primary-foreground', 'primary'], // primary button
  ['background', 'destructive'], // destructive button label
  ['background', 'foreground'], // tooltip (inverted)
];

const nonTextPairs: [string, string][] = [
  ['ring', 'background'],
  ['ring', 'card'],
  ['muted-foreground', 'background'], // checkbox border
];

describe('contrastRatio', () => {
  it('matches the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
    expect(contrastRatio('#777777', '#ffffff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#fff', '#000')).toBe(contrastRatio('#000000', '#ffffff'));
  });
});

describe('design tokens (src/styles/globals.css)', () => {
  it('reads the full colour table from docs/DESIGN_SYSTEM.md', () => {
    expect(Object.keys(spec.dark)).toHaveLength(13);
    expect(spec.dark.background).toBe('#0a0a0a');
    expect(spec.light.primary).toBe('#047857');
  });

  it.each(themes)('defines exactly the DESIGN_SYSTEM.md tokens in the %s theme', (theme) => {
    expect(css[theme]).toEqual(spec[theme]);
  });

  describe.each(themes)('%s theme contrast', (theme) => {
    const tokens = css[theme];
    const colour = (name: string) => {
      const value = tokens[name];
      if (value === undefined) throw new Error(`Missing --${name} in the ${theme} theme`);
      return value;
    };

    it.each(textPairs)(`text --%s on --%s is at least ${String(TEXT_MIN)}:1`, (fg, bg) => {
      expect(contrastRatio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(TEXT_MIN);
    });

    it.each(nonTextPairs)(`--%s against --%s is at least ${String(NON_TEXT_MIN)}:1`, (fg, bg) => {
      expect(contrastRatio(colour(fg), colour(bg))).toBeGreaterThanOrEqual(NON_TEXT_MIN);
    });
  });
});

describe('globals.css theme wiring', () => {
  const source = readGlobalsCss();

  it('maps every token to a Tailwind colour and removes the default palette', () => {
    expect(source).toMatch(/--color-\*:\s*initial;/);
    for (const name of Object.keys(spec.dark)) {
      expect(source).toContain(`--color-${name}: var(--${name});`);
    }
  });

  it('defines the 6/10/14 px radius scale', () => {
    expect(source).toContain('--radius-sm: 6px;');
    expect(source).toContain('--radius-md: 10px;');
    expect(source).toContain('--radius-lg: 14px;');
  });

  it('switches off all animations and transitions under prefers-reduced-motion', () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/.exec(source)?.[1];
    expect(reduced).toContain('animation: none !important;');
    expect(reduced).toContain('transition: none !important;');
  });

  it('follows the next-themes class for the dark variant', () => {
    expect(source).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });
});
