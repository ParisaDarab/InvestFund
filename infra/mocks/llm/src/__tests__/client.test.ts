// Over-the-wire test against a real listening server, sending the requests the official `openai`
// npm client sends (same paths, headers and bodies, including its default base64 embeddings).
//
// The card asks for a test through the `openai` package itself. That package is a P2 dependency
// (PHASE_PLAN §6) and not approved for P0, so the client test is a `todo` until Gate X approves it.

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createMockLlm, type MockLlm } from '../app.js';
import { loadConfig } from '../config.js';

import type { ChatCompletion } from '../chat.js';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';

let mock: MockLlm;
let server: Server;
let baseURL: string;

beforeAll(async () => {
  mock = createMockLlm(loadConfig({}));
  server = await new Promise<Server>((resolve, reject) => {
    const listening = mock.app.listen(0, '127.0.0.1', (error) => {
      if (error === undefined) resolve(listening);
      else reject(error);
    });
  });
  baseURL = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}/v1`;
});

afterAll(async () => {
  mock.close();
  await new Promise<void>((resolve) =>
    server.close(() => {
      resolve();
    }),
  );
});

/** The headers the openai client (v5/v6) sends on every request. */
const clientHeaders = {
  accept: 'application/json',
  'content-type': 'application/json',
  authorization: 'Bearer sandbox-mock-key',
  'user-agent': 'OpenAI/JS 6.0.0',
  'x-stainless-lang': 'js',
  'x-stainless-retry-count': '0',
};

describe('OpenAI wire compatibility over HTTP', () => {
  it('chat.completions.create: returns a well-formed response with usage (AC1)', async () => {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: clientHeaders,
      body: JSON.stringify({
        model: 'mock-chat',
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: [{ type: 'text', text: 'Hello' }] },
        ],
        temperature: 0.2,
      }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    const body = (await res.json()) as ChatCompletion;
    expect(body.object).toBe('chat.completion');
    expect(body.choices).toHaveLength(1);
    expect(body.usage.total_tokens).toBeGreaterThan(0);
  });

  it('embeddings.create: default base64 encoding decodes to a unit vector', async () => {
    const res = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: clientHeaders,
      body: JSON.stringify({ model: 'mock-embedding', input: 'hello', encoding_format: 'base64' }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { embedding: string }[] };
    const bytes = Buffer.from(body.data[0]?.embedding ?? '', 'base64');
    const vector = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
    expect(vector).toHaveLength(1536);
    expect(Math.hypot(...vector)).toBeCloseTo(1, 5);
  });

  it('models.list: lists models', async () => {
    const res = await fetch(`${baseURL}/models`, { headers: clientHeaders });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { object: string }).object).toBe('list');
  });

  it('returns a body that is not valid JSON when malformedJson targets embeddings', async () => {
    await fetch(`${baseURL.replace(/\/v1$/, '')}/__control`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ malformedJson: true, path: '/v1/embeddings' }),
    });
    const res = await fetch(`${baseURL}/embeddings`, {
      method: 'POST',
      headers: clientHeaders,
      body: JSON.stringify({ model: 'mock-embedding', input: 'x' }),
    });
    expect(res.status).toBe(200);
    await expect(res.json()).rejects.toThrow(SyntaxError);
  });

  it.todo('through the official `openai` npm client (needs Gate X: `openai` is a P2 dependency)');
});
