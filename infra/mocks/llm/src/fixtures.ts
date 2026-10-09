import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { z } from 'zod';

import { varsHash } from './hash.js';

/** Prompt IDs are dotted lower-case names, e.g. `extraction`, `matching.rationale`, `test.echo`. */
export const PROMPT_ID = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION_DIR = /^v([1-9]\d*)$/;
const VARS_HASH = /^[0-9a-f]{64}$/;
/** System-message marker: `[[prompt:<id>@v<version>]]` or `[[prompt:<id>@v<version>#<varsHash>]]`. */
const PROMPT_MARKER = /\[\[prompt:([a-z0-9][a-z0-9._-]*)@v([1-9]\d*)(?:#([0-9a-f]{64}))?\]\]/;

const FixtureUsage = z.strictObject({
  promptTokens: z.int().nonnegative(),
  completionTokens: z.int().nonnegative(),
});

const FixtureResponse = z.union([
  z.strictObject({
    content: z.string(),
    finishReason: z.enum(['stop', 'length', 'content_filter']).optional(),
  }),
  z.strictObject({
    toolCalls: z
      .array(
        z.strictObject({
          name: z.string().min(1),
          arguments: z.record(z.string(), z.json()),
        }),
      )
      .min(1),
  }),
  z.strictObject({ json: z.json() }),
]);
export type FixtureResponse = z.infer<typeof FixtureResponse>;

/** Shape of `fixtures/<promptId>/v<version>/<name>.json`. */
export const FixtureFile = z.strictObject({
  description: z.string().optional(),
  /** Prompt variables this fixture answers. Omit to make it the default for the prompt version. */
  vars: z.record(z.string(), z.json()).optional(),
  response: FixtureResponse,
  usage: FixtureUsage.optional(),
});

export interface Fixture {
  /** Path relative to the fixtures directory, with forward slashes. */
  file: string;
  promptId: string;
  version: number;
  /** `null` for the default fixture of a prompt version. */
  varsHash: string | null;
  response: FixtureResponse;
  usage: z.infer<typeof FixtureUsage> | null;
}

export interface PromptKey {
  promptId: string;
  version: number;
  varsHash: string | null;
}

export class FixtureError extends Error {
  override name = 'FixtureError';
}

function keyOf(promptId: string, version: number, hash: string | null): string {
  return `${promptId}@v${String(version)}#${hash ?? 'default'}`;
}

export class FixtureStore {
  readonly #byKey: Map<string, Fixture>;

  private constructor(fixtures: Fixture[]) {
    this.#byKey = new Map();
    for (const fixture of fixtures) {
      const key = keyOf(fixture.promptId, fixture.version, fixture.varsHash);
      const existing = this.#byKey.get(key);
      if (existing !== undefined) {
        throw new FixtureError(
          `Fixtures ${existing.file} and ${fixture.file} have the same prompt, version and vars`,
        );
      }
      this.#byKey.set(key, fixture);
    }
  }

  static fromFixtures(fixtures: Fixture[]): FixtureStore {
    return new FixtureStore(fixtures);
  }

  /**
   * Loads `<dir>/<promptId>/v<version>/*.json` in sorted order. A missing directory gives an empty
   * store. Any malformed file, unexpected directory name or duplicate key throws, so a broken
   * fixture set fails at start-up instead of silently falling back.
   */
  static load(dir: string): FixtureStore {
    if (!existsSync(dir)) return new FixtureStore([]);
    const fixtures: Fixture[] = [];
    for (const promptId of readdirSync(dir).sort()) {
      if (!statSync(join(dir, promptId)).isDirectory()) continue;
      if (!PROMPT_ID.test(promptId)) {
        throw new FixtureError(`Invalid prompt ID directory: ${promptId}`);
      }
      for (const versionDir of readdirSync(join(dir, promptId)).sort()) {
        const version = VERSION_DIR.exec(versionDir)?.[1];
        if (version === undefined) {
          throw new FixtureError(`Invalid version directory: ${promptId}/${versionDir}`);
        }
        const versionPath = join(dir, promptId, versionDir);
        for (const name of readdirSync(versionPath).sort()) {
          if (!name.endsWith('.json')) continue;
          const file = `${promptId}/${versionDir}/${name}`;
          let parsed: z.infer<typeof FixtureFile>;
          try {
            parsed = FixtureFile.parse(JSON.parse(readFileSync(join(versionPath, name), 'utf8')));
          } catch (error) {
            throw new FixtureError(
              `Invalid fixture ${file}: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          fixtures.push({
            file,
            promptId,
            version: Number(version),
            varsHash: parsed.vars === undefined ? null : varsHash(parsed.vars),
            response: parsed.response,
            usage: parsed.usage ?? null,
          });
        }
      }
    }
    return new FixtureStore(fixtures);
  }

  get size(): number {
    return this.#byKey.size;
  }

  /** Exact variables match first, then the prompt version's default fixture. */
  resolve(key: PromptKey): Fixture | undefined {
    if (key.varsHash !== null) {
      const exact = this.#byKey.get(keyOf(key.promptId, key.version, key.varsHash));
      if (exact !== undefined) return exact;
    }
    return this.#byKey.get(keyOf(key.promptId, key.version, null));
  }
}

export class PromptKeyError extends Error {
  override name = 'PromptKeyError';
}

/**
 * Reads the prompt key from the `x-prompt-id` / `x-prompt-version` / `x-prompt-vars-hash`
 * headers, or else from a `[[prompt:…]]` marker in the first system or developer message.
 * Returns `null` when the request carries neither. Throws `PromptKeyError` on malformed values.
 */
export function promptKeyFromRequest(
  headers: Readonly<Record<string, string | string[] | undefined>>,
  systemText: string | undefined,
): PromptKey | null {
  const header = (name: string): string | undefined => {
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const id = header('x-prompt-id');
  if (id !== undefined) {
    if (!PROMPT_ID.test(id)) throw new PromptKeyError(`Invalid x-prompt-id: ${id}`);
    const rawVersion = header('x-prompt-version');
    if (rawVersion === undefined) {
      throw new PromptKeyError('x-prompt-version is required with x-prompt-id');
    }
    const version = /^v?([1-9]\d{0,5})$/.exec(rawVersion)?.[1];
    if (version === undefined) {
      throw new PromptKeyError(`Invalid x-prompt-version: ${rawVersion}`);
    }
    const hash = header('x-prompt-vars-hash')?.toLowerCase();
    if (hash !== undefined && !VARS_HASH.test(hash)) {
      throw new PromptKeyError('x-prompt-vars-hash must be 64 hex characters (sha256)');
    }
    return { promptId: id, version: Number(version), varsHash: hash ?? null };
  }
  if (systemText === undefined) return null;
  const marker = PROMPT_MARKER.exec(systemText);
  if (marker === null) return null;
  const [, promptId = '', version = '1', hash] = marker;
  return { promptId, version: Number(version), varsHash: hash ?? null };
}
