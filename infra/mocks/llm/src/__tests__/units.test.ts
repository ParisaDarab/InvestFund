import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { buildCompletion, MALFORMED_JSON, type ChatCompletionRequest } from '../chat.js';
import { loadConfig } from '../config.js';
import { ControlState } from '../control.js';
import { embed, resolveDimensions, toBase64 } from '../embeddings.js';
import { FixtureError, FixtureStore, promptKeyFromRequest, PromptKeyError } from '../fixtures.js';
import { canonicalJson, varsHash } from '../hash.js';
import { FIXED_DATE_TIME, sampleFromSchema } from '../json-schema.js';

const norm = (vector: readonly number[]): number =>
  Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

describe('canonicalJson / varsHash', () => {
  it('sorts keys recursively and drops undefined members', () => {
    expect(canonicalJson({ b: 1, a: { d: [true, null], c: 'x' }, z: undefined })).toBe(
      '{"a":{"c":"x","d":[true,null]},"b":1}',
    );
  });

  it('gives the same hash regardless of key order', () => {
    expect(varsHash({ a: 1, b: 'two' })).toBe(varsHash({ b: 'two', a: 1 }));
    expect(varsHash({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(varsHash({ a: 1 })).not.toBe(varsHash({ a: 2 }));
  });

  it('rejects values that are not JSON', () => {
    expect(() => canonicalJson(Number.NaN)).toThrow(TypeError);
    expect(() => canonicalJson(() => 1)).toThrow(TypeError);
  });
});

describe('embeddings', () => {
  it('is deterministic for the same input', () => {
    expect(embed('hello world', 64)).toEqual(embed('hello world', 64));
  });

  it('has the requested dimension and unit length', () => {
    for (const dimensions of [1, 3, 384, 1536]) {
      const vector = embed('some text', dimensions);
      expect(vector).toHaveLength(dimensions);
      expect(norm(vector)).toBeCloseTo(1, 5);
    }
  });

  it('gives different vectors for different inputs', () => {
    expect(embed('a', 16)).not.toEqual(embed('b', 16));
  });

  it('encodes base64 as little-endian float32 that decodes to the same numbers', () => {
    const vector = embed('base64', 8);
    const bytes = Buffer.from(toBase64(vector), 'base64');
    const decoded = Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, 8));
    expect(decoded).toEqual(vector);
  });

  it('rejects invalid dimensions', () => {
    expect(() => embed('x', 0)).toThrow(RangeError);
    expect(() => embed('x', 8193)).toThrow(RangeError);
  });

  it('resolves the dimension from the request, then the model map, then the default', () => {
    const models = { small: 384 };
    expect(resolveDimensions('small', 256, models, 1536)).toBe(256);
    expect(resolveDimensions('small', undefined, models, 1536)).toBe(384);
    expect(resolveDimensions('other', undefined, models, 1536)).toBe(1536);
  });
});

describe('ControlState', () => {
  it('serves a rule for exactly `next` calls, then nothing', () => {
    const control = new ControlState();
    control.add({ next: 2, fail: 429, retryAfter: 3 });
    expect(control.take('/v1/chat/completions')).toEqual({ fail: 429, retryAfter: 3 });
    expect(control.pending()).toEqual([{ remaining: 1, path: null, effect: '429' }]);
    expect(control.take('/v1/chat/completions')?.fail).toBe(429);
    expect(control.take('/v1/chat/completions')).toBeUndefined();
    expect(control.pending()).toEqual([]);
  });

  it('applies rules in FIFO order and honours the path prefix', () => {
    const control = new ControlState();
    control.add({ path: '/v1/embeddings', malformedJson: true });
    control.add({ latencyMs: 5 });
    expect(control.take('/v1/chat/completions')).toEqual({ latencyMs: 5, retryAfter: 1 });
    expect(control.take('/v1/embeddings')).toEqual({ malformedJson: true, retryAfter: 1 });
    expect(control.take('/v1/embeddings')).toBeUndefined();
  });

  it('rejects rules without an effect, with two outcomes, or with unknown keys', () => {
    const control = new ControlState();
    expect(() => control.add({ next: 1 })).toThrow();
    expect(() => control.add({ fail: 429, timeout: true })).toThrow();
    expect(() => control.add({ fail: 418 })).toThrow();
    expect(() => control.add({ fail: 500, extra: 1 })).toThrow();
    expect(() => control.add({ next: 0, fail: 500 })).toThrow();
  });

  it('clears all rules', () => {
    const control = new ControlState();
    control.add({ next: 5, timeout: true });
    control.clear();
    expect(control.take('/v1/models')).toBeUndefined();
  });
});

describe('fixtures', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** Writes the given fixture files into a new temporary directory and returns its path. */
  function fixtureDir(files: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), 'mock-llm-fixtures-'));
    dirs.push(dir);
    for (const [path, body] of Object.entries(files)) {
      const full = join(dir, path);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, JSON.stringify(body));
    }
    return dir;
  }

  it('resolves an exact vars match first, then the default, then nothing', () => {
    const store = FixtureStore.load(
      fixtureDir({
        'p.one/v1/default.json': { response: { content: 'default' } },
        'p.one/v1/a.json': { vars: { x: 1 }, response: { content: 'a' } },
        'p.one/v2/b.json': { vars: { x: 1 }, response: { json: { b: true } } },
      }),
    );
    expect(store.size).toBe(3);

    const hash = varsHash({ x: 1 });
    expect(store.resolve({ promptId: 'p.one', version: 1, varsHash: hash })?.file).toBe(
      'p.one/v1/a.json',
    );
    expect(
      store.resolve({ promptId: 'p.one', version: 1, varsHash: varsHash({ x: 2 }) })?.file,
    ).toBe('p.one/v1/default.json');
    expect(store.resolve({ promptId: 'p.one', version: 1, varsHash: null })?.file).toBe(
      'p.one/v1/default.json',
    );
    expect(store.resolve({ promptId: 'p.one', version: 2, varsHash: null })).toBeUndefined();
    expect(store.resolve({ promptId: 'p.one', version: 2, varsHash: hash })?.file).toBe(
      'p.one/v2/b.json',
    );
    expect(store.resolve({ promptId: 'other', version: 1, varsHash: null })).toBeUndefined();
  });

  it('fails fast on malformed fixtures, bad directory names and duplicate keys', () => {
    expect(() =>
      FixtureStore.load(fixtureDir({ 'p/v1/bad.json': { response: { nope: 1 } } })),
    ).toThrow(FixtureError);
    expect(() =>
      FixtureStore.load(fixtureDir({ 'p/version1/a.json': { response: { content: 'x' } } })),
    ).toThrow(/Invalid version directory/);
    expect(() =>
      FixtureStore.load(fixtureDir({ 'Bad Id/v1/a.json': { response: { content: 'x' } } })),
    ).toThrow(/Invalid prompt ID directory/);
    expect(() =>
      FixtureStore.load(
        fixtureDir({
          'p/v1/a.json': { vars: { k: 'v' }, response: { content: 'x' } },
          'p/v1/b.json': { vars: { k: 'v' }, response: { content: 'y' } },
        }),
      ),
    ).toThrow(/same prompt, version and vars/);
  });

  it('returns an empty store when the directory does not exist', () => {
    expect(FixtureStore.load(join(tmpdir(), 'does-not-exist-mock-llm')).size).toBe(0);
  });

  it('loads the shipped fixtures', () => {
    const store = FixtureStore.load(loadConfig({}).fixturesDir);
    expect(
      store.resolve({ promptId: 'test.echo', version: 1, varsHash: varsHash({ text: 'hello' }) })
        ?.file,
    ).toBe('test.echo/v1/hello.json');
  });
});

describe('promptKeyFromRequest', () => {
  const hash = 'a'.repeat(64);

  it('reads the headers', () => {
    expect(
      promptKeyFromRequest(
        { 'x-prompt-id': 'extraction', 'x-prompt-version': 'v2', 'x-prompt-vars-hash': hash },
        undefined,
      ),
    ).toEqual({ promptId: 'extraction', version: 2, varsHash: hash });
    expect(
      promptKeyFromRequest({ 'x-prompt-id': 'extraction', 'x-prompt-version': '3' }, undefined),
    ).toEqual({ promptId: 'extraction', version: 3, varsHash: null });
  });

  it('prefers headers over the system-message marker', () => {
    expect(
      promptKeyFromRequest(
        { 'x-prompt-id': 'a', 'x-prompt-version': '1' },
        '[[prompt:b@v2]] You are…',
      )?.promptId,
    ).toBe('a');
  });

  it('reads the marker in the system message', () => {
    expect(promptKeyFromRequest({}, `Intro [[prompt:matching.rationale@v4#${hash}]]`)).toEqual({
      promptId: 'matching.rationale',
      version: 4,
      varsHash: hash,
    });
    expect(promptKeyFromRequest({}, 'No marker here')).toBeNull();
    expect(promptKeyFromRequest({}, undefined)).toBeNull();
  });

  it('rejects malformed headers', () => {
    expect(() => promptKeyFromRequest({ 'x-prompt-id': 'a' }, undefined)).toThrow(PromptKeyError);
    expect(() =>
      promptKeyFromRequest({ 'x-prompt-id': 'Bad Id', 'x-prompt-version': '1' }, undefined),
    ).toThrow(PromptKeyError);
    expect(() =>
      promptKeyFromRequest({ 'x-prompt-id': 'a', 'x-prompt-version': 'v0' }, undefined),
    ).toThrow(PromptKeyError);
    expect(() =>
      promptKeyFromRequest(
        { 'x-prompt-id': 'a', 'x-prompt-version': '1', 'x-prompt-vars-hash': 'abc' },
        undefined,
      ),
    ).toThrow(PromptKeyError);
  });
});

describe('sampleFromSchema', () => {
  it('builds a value that follows a typical structured-output schema', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string', minLength: 6 },
        score: { type: 'integer', minimum: 10, maximum: 100 },
        ratio: { type: 'number', exclusiveMinimum: 0 },
        stage: { type: 'string', enum: ['pre-seed', 'seed'] },
        flag: { type: 'boolean' },
        at: { type: 'string', format: 'date-time' },
        tags: { type: 'array', items: { type: 'string' }, minItems: 2 },
        note: { anyOf: [{ type: 'null' }, { type: 'string', maxLength: 2 }] },
        kind: { const: 'fact' },
        ref: { $ref: '#/$defs/Money' },
        nullable: { type: ['null', 'integer'] },
      },
      required: ['name'],
      additionalProperties: false,
      $defs: { Money: { type: 'object', properties: { amountMinor: { type: 'string' } } } },
    };
    expect(sampleFromSchema(schema)).toEqual({
      name: 'mockxx',
      score: 10,
      ratio: 0.5,
      stage: 'pre-seed',
      flag: false,
      at: FIXED_DATE_TIME,
      tags: ['mock', 'mock'],
      note: 'mo',
      kind: 'fact',
      ref: { amountMinor: 'mock' },
      nullable: 0,
    });
  });

  it('terminates on recursive schemas', () => {
    const schema = {
      $ref: '#/$defs/Node',
      $defs: {
        Node: {
          type: 'object',
          properties: { children: { type: 'array', items: { $ref: '#/$defs/Node' } } },
          required: [],
        },
      },
    };
    expect(() => JSON.stringify(sampleFromSchema(schema))).not.toThrow();
  });

  it('respects maximum below the default and maxItems 0', () => {
    expect(sampleFromSchema({ type: 'integer', maximum: -5 })).toBe(-5);
    expect(sampleFromSchema({ type: 'array', items: { type: 'string' }, maxItems: 0 })).toEqual([]);
    expect(
      sampleFromSchema({ allOf: [{ type: 'object', properties: { a: { type: 'boolean' } } }] }),
    ).toEqual({ a: false });
  });
});

describe('buildCompletion', () => {
  const base: ChatCompletionRequest = {
    model: 'mock-chat',
    messages: [{ role: 'user', content: 'Hi' }],
  };

  it('is deterministic and includes usage', () => {
    const first = buildCompletion(base, undefined, null, { malformedJson: false });
    const second = buildCompletion(base, undefined, null, { malformedJson: false });
    expect(first).toEqual(second);
    expect(first.source).toBe('fallback');
    expect(first.completion.usage.total_tokens).toBe(
      first.completion.usage.prompt_tokens + first.completion.usage.completion_tokens,
    );
  });

  it('returns a tool call when the request forces one', () => {
    const { completion } = buildCompletion(
      {
        ...base,
        tools: [
          {
            type: 'function',
            function: {
              name: 'search_matches',
              parameters: {
                type: 'object',
                properties: { limit: { type: 'integer', minimum: 1 } },
              },
            },
          },
        ],
        tool_choice: 'required',
      },
      undefined,
      null,
      { malformedJson: false },
    );
    const choice = completion.choices[0];
    expect(choice?.finish_reason).toBe('tool_calls');
    expect(choice?.message.tool_calls?.[0]?.function).toEqual({
      name: 'search_matches',
      arguments: '{"limit":1}',
    });
  });

  it('answers in text when tool_choice is auto and no fixture matches', () => {
    const { completion } = buildCompletion(
      { ...base, tools: [{ type: 'function', function: { name: 'x' } }], tool_choice: 'auto' },
      undefined,
      null,
      { malformedJson: false },
    );
    expect(completion.choices[0]?.message.tool_calls).toBeUndefined();
  });

  it('corrupts the content when malformedJson is injected', () => {
    const { completion } = buildCompletion(
      { ...base, response_format: { type: 'json_object' } },
      undefined,
      null,
      { malformedJson: true },
    );
    const content = completion.choices[0]?.message.content ?? '';
    expect(content).toBe(MALFORMED_JSON);
    expect(() => JSON.parse(content) as unknown).toThrow(SyntaxError);
  });
});

describe('loadConfig', () => {
  it('applies defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 4010,
      host: '127.0.0.1',
      embeddingDimensions: 1536,
      embeddingModels: {},
      chatModels: ['mock-chat'],
      recordContent: false,
    });
  });

  it('parses the model map and booleans, and rejects bad values', () => {
    const config = loadConfig({
      MOCK_EMBEDDING_MODELS: 'small=384, large=3072',
      MOCK_RECORD_CONTENT: 'true',
      MOCK_CHAT_MODELS: 'a,b',
    });
    expect(config.embeddingModels).toEqual({ small: 384, large: 3072 });
    expect(config.recordContent).toBe(true);
    expect(config.chatModels).toEqual(['a', 'b']);
    expect(() => loadConfig({ MOCK_EMBEDDING_MODELS: 'small' })).toThrow();
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
  });
});
