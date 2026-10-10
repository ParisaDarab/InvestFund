import { randomBytes } from 'node:crypto';

/** URL slug from a name plus a short random suffix: `solar-schools-4f9a2c`. */
export function makeSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
  return `${base === '' ? 'startup' : base}-${randomBytes(3).toString('hex')}`;
}
