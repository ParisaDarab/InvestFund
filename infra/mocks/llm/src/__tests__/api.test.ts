import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createMockLlm, type MockLlm } from '../app.js';
import { MALFORMED_JSON } from '../chat.js';
import { loadConfig } from '../config.js';
import { varsHash } from '../hash.js';

import type { CallRecord } from '../calls.js';
import type { ChatCompletion } from '../chat.js';

const AUTH = 'Bearer test-key';

interface EmbeddingList {
  object: 'list';
  data: { object: 'embedding'; index: number; embedding: number[] | string }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}

interface OpenAiError {
  error: { message: string; type: string; param: string | null; code: string | null };
}

let mock: MockLlm;

beforeEach(() => {
  mock = createMockLlm(loadConfig({ MOCK_EMBEDDING_MODELS: 'mock-embedding-small=384' }));
});
afterEach(() => {
  mock.close();
});

function chat(body: object, headers: Record<string, string> = {}) {
  let test = request(mock.app).post('/v1/chat/completions').set('authorization', AUTH);
  for (const [name, value] of Object.entries(headers)) test = test.set(name, value);
  return test.send(body);
}

async function callLog(): Promise<CallRecord[]> {
  const res = await request(mock.app).get('/__calls');
  return (res.body as { calls: CallRecord[] }).calls;
}

describe('GET /health', () => {
  it('reports ok without authentication', async () => {
    const res = await request(mock.app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok' });
  });
});

describe('POST /v1/chat/completions', () => {
  it('returns a well-formed completion with usage (AC1)', async () => {
    const res = await chat({ model: 'mock-chat', messages: [{ role: 'user', content: 'Hello' }] });
    expect(res.status).toBe(200);
    const body = res.body as ChatCompletion;
    expect(body).toMatchObject({
      object: 'chat.completion',
      model: 'mock-chat',
      choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', refusal: null } }],
    });
    expect(body.id).toMatch(/^chatcmpl-mock-[0-9a-f]{24}$/);
    expect(typeof body.choices[0]?.message.content).toBe('string');
    expect(body.usage.prompt_tokens).toBeGreaterThan(0);
    expect(body.usage.completion_tokens).toBeGreaterThan(0);
    expect(body.usage.total_tokens).toBe(body.usage.prompt_tokens + body.usage.completion_tokens);
  });

  it('is deterministic: the same request gives a byte-identical response', async () => {
    const body = { model: 'mock-chat', messages: [{ role: 'user', content: 'Same' }] };
    const first = await chat(body);
    const second = await chat(body);
    expect(second.text).toBe(first.text);
  });

  it('returns the fixture verbatim for a matching prompt ID and vars (AC3, headers)', async () => {
    const res = await chat(
      { model: 'mock-chat', messages: [{ role: 'user', content: 'Echo hello' }] },
      {
        'x-prompt-id': 'test.echo',
        'x-prompt-version': '1',
        'x-prompt-vars-hash': varsHash({ text: 'hello' }),
      },
    );
    const body = res.body as ChatCompletion;
    expect(body.choices[0]?.message.content).toBe('{"echo":"hello","source":"fixture"}');
    expect(body.usage).toEqual({ prompt_tokens: 12, completion_tokens: 9, total_tokens: 21 });
  });

  it('returns the fixture for a system-message marker (AC3, marker)', async () => {
    const res = await chat({
      model: 'mock-chat',
      messages: [
        { role: 'system', content: `[[prompt:test.echo@v1#${varsHash({ text: 'hello' })}]] Echo.` },
        { role: 'user', content: 'hello' },
      ],
    });
    expect((res.body as ChatCompletion).choices[0]?.message.content).toBe(
      '{"echo":"hello","source":"fixture"}',
    );
  });

  it('falls back to the default fixture when vars do not match', async () => {
    const res = await chat(
      { model: 'mock-chat', messages: [{ role: 'user', content: 'x' }] },
      {
        'x-prompt-id': 'test.echo',
        'x-prompt-version': 'v1',
        'x-prompt-vars-hash': varsHash({ text: 'other' }),
      },
    );
    expect((res.body as ChatCompletion).choices[0]?.message.content).toBe(
      'test.echo v1 default fixture',
    );
  });

  it('returns fixture tool calls', async () => {
    const res = await chat(
      { model: 'mock-chat', messages: [{ role: 'user', content: 'x' }] },
      {
        'x-prompt-id': 'test.echo',
        'x-prompt-version': '1',
        'x-prompt-vars-hash': varsHash({ text: 'tool' }),
      },
    );
    const choice = (res.body as ChatCompletion).choices[0];
    expect(choice?.finish_reason).toBe('tool_calls');
    expect(choice?.message.content).toBeNull();
    expect(choice?.message.tool_calls?.[0]).toMatchObject({
      type: 'function',
      function: { name: 'echo', arguments: '{"text":"tool"}' },
    });
  });

  it('answers a json_schema request with JSON valid for the schema', async () => {
    const res = await chat({
      model: 'mock-chat',
      messages: [{ role: 'user', content: 'Extract' }],
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'facts',
          strict: true,
          schema: {
            type: 'object',
            properties: { company: { type: 'string' }, employees: { type: 'integer' } },
            required: ['company', 'employees'],
            additionalProperties: false,
          },
        },
      },
    });
    const content = (res.body as ChatCompletion).choices[0]?.message.content ?? '';
    expect(JSON.parse(content)).toEqual({ company: 'mock', employees: 0 });
  });

  it('answers a json_object request with valid JSON', async () => {
    const res = await chat({
      model: 'mock-chat',
      messages: [{ role: 'user', content: 'JSON please' }],
      response_format: { type: 'json_object' },
    });
    expect(JSON.parse((res.body as ChatCompletion).choices[0]?.message.content ?? '')).toEqual({});
  });

  it('rejects invalid requests with an OpenAI-shaped 400', async () => {
    const res = await chat({ model: 'mock-chat', messages: [] });
    expect(res.status).toBe(400);
    expect((res.body as OpenAiError).error.type).toBe('invalid_request_error');

    const stream = await chat({
      model: 'mock-chat',
      messages: [{ role: 'user', content: 'x' }],
      stream: true,
    });
    expect(stream.status).toBe(400);
    expect((stream.body as OpenAiError).error.param).toBe('stream');

    const badHeader = await chat(
      { model: 'mock-chat', messages: [{ role: 'user', content: 'x' }] },
      { 'x-prompt-id': 'test.echo' },
    );
    expect(badHeader.status).toBe(400);

    const badJson = await request(mock.app)
      .post('/v1/chat/completions')
      .set('authorization', AUTH)
      .set('content-type', 'application/json')
      .send('{not json');
    expect(badJson.status).toBe(400);
    expect((badJson.body as OpenAiError).error.type).toBe('invalid_request_error');
  });

  it('requires a bearer key (any value)', async () => {
    const res = await request(mock.app)
      .post('/v1/chat/completions')
      .send({ model: 'mock-chat', messages: [{ role: 'user', content: 'x' }] });
    expect(res.status).toBe(401);
    expect((res.body as OpenAiError).error.code).toBe('invalid_api_key');
  });
});

describe('POST /v1/embeddings', () => {
  async function embeddings(body: object): Promise<EmbeddingList> {
    const res = await request(mock.app)
      .post('/v1/embeddings')
      .set('authorization', AUTH)
      .send(body);
    expect(res.status).toBe(200);
    return res.body as EmbeddingList;
  }

  it('is deterministic, unit length, configured dimension; different inputs differ (AC2)', async () => {
    const first = await embeddings({ model: 'mock-embedding', input: ['alpha', 'beta'] });
    const second = await embeddings({ model: 'mock-embedding', input: ['alpha', 'beta'] });
    expect(second).toEqual(first);
    const [alpha, beta] = first.data.map((item) => item.embedding as number[]);
    expect(alpha).toHaveLength(1536);
    expect(Math.hypot(...(alpha ?? []))).toBeCloseTo(1, 5);
    expect(beta).not.toEqual(alpha);
    expect(first.usage.prompt_tokens).toBeGreaterThan(0);
    expect(first.data.map((item) => item.index)).toEqual([0, 1]);
  });

  it('uses the model mapping and the dimensions parameter', async () => {
    const mapped = await embeddings({ model: 'mock-embedding-small', input: 'x' });
    expect(mapped.data[0]?.embedding).toHaveLength(384);
    const explicit = await embeddings({ model: 'mock-embedding', input: 'x', dimensions: 8 });
    expect(explicit.data[0]?.embedding).toHaveLength(8);
  });

  it('supports the base64 encoding the openai client requests by default', async () => {
    const asFloat = await embeddings({ model: 'mock-embedding', input: 'x', dimensions: 4 });
    const asBase64 = await embeddings({
      model: 'mock-embedding',
      input: 'x',
      dimensions: 4,
      encoding_format: 'base64',
    });
    const bytes = Buffer.from(asBase64.data[0]?.embedding as string, 'base64');
    expect(Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, 4))).toEqual(
      asFloat.data[0]?.embedding,
    );
  });

  it('treats one token array as one input', async () => {
    const res = await embeddings({ model: 'mock-embedding', input: [1, 2, 3], dimensions: 4 });
    expect(res.data).toHaveLength(1);
  });

  it('rejects an invalid request', async () => {
    const res = await request(mock.app)
      .post('/v1/embeddings')
      .set('authorization', AUTH)
      .send({ model: 'mock-embedding', input: [] });
    expect(res.status).toBe(400);
  });
});

describe('GET /v1/models', () => {
  it('lists the configured models', async () => {
    const res = await request(mock.app).get('/v1/models').set('authorization', AUTH);
    expect(res.status).toBe(200);
    const ids = (res.body as { data: { id: string }[] }).data.map((model) => model.id);
    expect(ids).toEqual(['mock-chat', 'mock-embedding', 'mock-embedding-small']);
  });

  it('returns an OpenAI-shaped 404 for unknown /v1 endpoints', async () => {
    const res = await request(mock.app).get('/v1/unknown').set('authorization', AUTH);
    expect(res.status).toBe(404);
    expect((res.body as OpenAiError).error.type).toBe('not_found_error');
  });
});

describe('failure injection (POST /__control)', () => {
  const body = { model: 'mock-chat', messages: [{ role: 'user', content: 'x' }] };

  it('fails the next two calls with 429 and retry-after, then succeeds (AC4)', async () => {
    const control = await request(mock.app).post('/__control').send({ next: 2, fail: 429 });
    expect(control.status).toBe(201);
    const first = await chat(body);
    const second = await chat(body);
    const third = await chat(body);
    expect([first.status, second.status, third.status]).toEqual([429, 429, 200]);
    expect(first.headers['retry-after']).toBe('1');
    expect((first.body as OpenAiError).error.code).toBe('rate_limit_exceeded');
    expect((await callLog()).map((call) => call.injected)).toEqual(['429', '429', null]);
  });

  it('returns invalid JSON content for a json_schema request (AC5)', async () => {
    await request(mock.app).post('/__control').send({ next: 1, malformedJson: true });
    const res = await chat({
      ...body,
      response_format: {
        type: 'json_schema',
        json_schema: { name: 'x', schema: { type: 'object', properties: {} } },
      },
    });
    expect(res.status).toBe(200);
    const content = (res.body as ChatCompletion).choices[0]?.message.content ?? '';
    expect(() => JSON.parse(content) as unknown).toThrow(SyntaxError);
    expect(content).toBe(MALFORMED_JSON);
  });

  it('injects 500 and 503', async () => {
    await request(mock.app).post('/__control').send({ fail: 500 });
    await request(mock.app).post('/__control').send({ fail: 503, retryAfter: 7 });
    const first = await chat(body);
    const second = await chat(body);
    expect(first.status).toBe(500);
    expect((first.body as OpenAiError).error.type).toBe('server_error');
    expect(second.status).toBe(503);
    expect(second.headers['retry-after']).toBe('7');
  });

  it('adds latency before answering', async () => {
    await request(mock.app).post('/__control').send({ latencyMs: 120 });
    const started = performance.now();
    const res = await chat(body);
    expect(res.status).toBe(200);
    expect(performance.now() - started).toBeGreaterThanOrEqual(100);
  });

  it('never answers a timed-out call', async () => {
    await request(mock.app).post('/__control').send({ timeout: true });
    await expect(chat(body).timeout(300)).rejects.toThrow(/timeout/i);
    const calls = await callLog();
    expect(calls[0]).toMatchObject({ injected: 'timeout', status: null });
  });

  it('lists pending rules and rejects invalid rules', async () => {
    await request(mock.app).post('/__control').send({ next: 3, fail: 500, path: '/v1/chat' });
    const pending = await request(mock.app).get('/__control');
    expect(pending.body).toEqual({ pending: [{ remaining: 3, path: '/v1/chat', effect: '500' }] });
    const invalid = await request(mock.app).post('/__control').send({ next: 1 });
    expect(invalid.status).toBe(400);
  });
});

describe('call log (GET /__calls, POST /__reset)', () => {
  it('lists every call in order, without content by default; reset empties it (AC6)', async () => {
    await chat(
      { model: 'mock-chat', messages: [{ role: 'user', content: 'secret prompt text' }] },
      { 'x-prompt-id': 'test.echo', 'x-prompt-version': '1' },
    );
    await request(mock.app)
      .post('/v1/embeddings')
      .set('authorization', AUTH)
      .send({ model: 'mock-embedding', input: ['a', 'b'] });
    await request(mock.app).get('/v1/models').set('authorization', AUTH);
    await request(mock.app).get('/health');

    const calls = await callLog();
    expect(calls.map((call) => [call.seq, call.method, call.path, call.status])).toEqual([
      [1, 'POST', '/v1/chat/completions', 200],
      [2, 'POST', '/v1/embeddings', 200],
      [3, 'GET', '/v1/models', 200],
    ]);
    expect(calls[0]).toMatchObject({
      model: 'mock-chat',
      promptId: 'test.echo',
      promptVersion: 1,
      fixture: 'test.echo/v1/default.json',
    });
    expect(calls[0]?.usage?.total_tokens).toBeGreaterThan(0);
    expect(calls[1]).toMatchObject({ model: 'mock-embedding', inputCount: 2 });
    expect(JSON.stringify(calls)).not.toContain('secret prompt text');

    await request(mock.app).post('/__control').send({ next: 5, fail: 500 });
    const reset = await request(mock.app).post('/__reset');
    expect(reset.status).toBe(200);
    expect(await callLog()).toEqual([]);
    expect((await request(mock.app).get('/__control')).body).toEqual({ pending: [] });
    expect((await chat({ model: 'm', messages: [{ role: 'user', content: 'x' }] })).status).toBe(
      200,
    );
    expect((await callLog())[0]?.seq).toBe(1);
  });

  it('records content only when MOCK_RECORD_CONTENT=true', async () => {
    const recording = createMockLlm(loadConfig({ MOCK_RECORD_CONTENT: 'true' }));
    await request(recording.app)
      .post('/v1/chat/completions')
      .set('authorization', AUTH)
      .send({ model: 'mock-chat', messages: [{ role: 'user', content: 'visible text' }] });
    const res = await request(recording.app).get('/__calls');
    expect(JSON.stringify(res.body)).toContain('visible text');
    recording.close();
  });

  it('reloads fixtures on reset', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mock-llm-reload-'));
    try {
      const reloading = createMockLlm(loadConfig({ MOCK_FIXTURES_DIR: dir }));
      mkdirSync(join(dir, 'late', 'v1'), { recursive: true });
      writeFileSync(join(dir, 'late', 'v1', 'a.json'), '{"response":{"content":"late"}}');
      const reset = await request(reloading.app).post('/__reset');
      expect(reset.body).toEqual({ status: 'reset', fixtures: 1 });

      writeFileSync(join(dir, 'late', 'v1', 'b.json'), '{"broken": true}');
      const broken = await request(reloading.app).post('/__reset');
      expect(broken.status).toBe(500);
      reloading.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
