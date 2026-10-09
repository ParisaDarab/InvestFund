import { readFileSync } from 'node:fs';

export type TokenMap = Record<string, string>;
export interface ThemeTokens {
  light: TokenMap;
  dark: TokenMap;
}

const globalsCss = new URL('../../src/styles/globals.css', import.meta.url);
const designSystemMd = new URL('../../../../docs/DESIGN_SYSTEM.md', import.meta.url);

export function readGlobalsCss(): string {
  return readFileSync(globalsCss, 'utf8');
}

function declarations(block: string): TokenMap {
  const tokens: TokenMap = {};
  for (const [, name, value] of block.matchAll(/--([\w-]+):\s*([^;]+);/g)) {
    if (name !== undefined && value !== undefined) tokens[name] = normaliseColour(value);
  }
  return tokens;
}

function block(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`^${escaped} \\{([^}]*)\\}`, 'm').exec(css);
  if (match?.[1] === undefined)
    throw new Error(`No top-level "${selector} {" block in globals.css`);
  return match[1];
}

/** Light tokens from `:root` and dark tokens from `.dark` in src/styles/globals.css. */
export function tokensFromCss(css = readGlobalsCss()): ThemeTokens {
  return { light: declarations(block(css, ':root')), dark: declarations(block(css, '.dark')) };
}

/** The colour token table in docs/DESIGN_SYSTEM.md (columns: token, dark, light). */
export function tokensFromDesignSystem(): ThemeTokens {
  const md = readFileSync(designSystemMd, 'utf8');
  const light: TokenMap = {};
  const dark: TokenMap = {};
  const row = /^\|\s*`--([\w-]+)`[^|]*\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|/gm;
  for (const [, name, darkValue, lightValue] of md.matchAll(row)) {
    if (name === undefined || darkValue === undefined || lightValue === undefined) continue;
    dark[name] = normaliseColour(darkValue);
    light[name] = normaliseColour(lightValue);
  }
  return { light, dark };
}

export function normaliseColour(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '');
}

/** sRGB channels (0-255) of a `#rrggbb` or `#rgb` colour. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (match?.[1] === undefined) throw new Error(`Not an opaque hex colour: ${hex}`);
  const digits = match[1].length === 3 ? match[1].replace(/./g, '$&$&') : match[1];
  return [0, 2, 4].map((i) => parseInt(digits.slice(i, i + 2), 16)) as [number, number, number];
}

/** WCAG 2.x relative luminance. */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((channel) => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio, from 1 to 21. */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}
