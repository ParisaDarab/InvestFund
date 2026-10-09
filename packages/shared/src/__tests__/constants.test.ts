import { describe, expect, it } from 'vitest';

import apiDoc from '../../../../docs/API.md?raw';
import {
  PROBLEM_TYPE_BASE_URI,
  PROBLEM_TYPE_SLUGS,
  PROBLEM_TYPE_STATUS,
  problemTypeUri,
} from '../constants/problem-types.js';
import { RATE_LIMIT_PRESETS } from '../constants/rate-limits.js';

/** Returns the Markdown between a heading line starting with `start` and the next `## ` heading. */
function section(markdown: string, start: string): string {
  const lines = markdown.split('\n');
  const from = lines.findIndex((line) => line.startsWith(start));
  if (from === -1) throw new Error(`Heading not found in docs/API.md: ${start}`);
  const to = lines.findIndex((line, index) => index > from && line.startsWith('## '));
  return lines.slice(from + 1, to === -1 ? undefined : to).join('\n');
}

/** Table rows as arrays of trimmed cells, skipping the header and separator rows. */
function tableRows(markdown: string): string[][] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('|'))
    .map((line) =>
      line
        .slice(1, -1)
        .split('|')
        .map((cell) => cell.trim()),
    )
    .slice(2);
}

const backticked = (cell: string) => [...cell.matchAll(/`([^`]+)`/g)].map((m) => m[1] ?? '');

describe('problem types', () => {
  it('match the table in docs/API.md §2 (slug and status)', () => {
    const table = section(apiDoc, '### Standard problem types');
    const documented: Record<string, number> = {};
    for (const [status = '', slugs = ''] of tableRows(table)) {
      for (const slug of backticked(slugs)) documented[slug] = Number(status);
    }
    expect(Object.keys(documented).length).toBeGreaterThan(0);
    expect(PROBLEM_TYPE_STATUS).toEqual(documented);
  });

  it('builds the documented type URI', () => {
    const lines = apiDoc.split('\n');
    const heading = lines.find((line) => line.startsWith('### Standard problem types'));
    expect(heading).toContain(`${PROBLEM_TYPE_BASE_URI}<slug>`);
    expect(problemTypeUri('not-found')).toBe('https://investfund.local/problems/not-found');
    expect(PROBLEM_TYPE_SLUGS).toContain('validation-error');
  });
});

describe('rate-limit presets', () => {
  it('match the presets in docs/API.md §3', () => {
    const rows = tableRows(section(apiDoc, '## 3. Rate-limit presets'));
    const documented = rows.flatMap(([preset = '']) => backticked(preset));
    expect([...RATE_LIMIT_PRESETS]).toEqual(documented);
  });
});
