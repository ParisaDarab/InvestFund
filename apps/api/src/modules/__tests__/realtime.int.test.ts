/**
 * Real-time delivery over SSE. Two API instances share one database with the Postgres bus:
 * a message posted through instance A reaches the recipient's stream on instance B, and never
 * reaches an unrelated user's stream.
 */
import { randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  connect,
  publishStartup,
  startDomainHarness,
  type DomainHarness,
  type TestUser,
} from '../../__tests__/domain-support.js';
import { captureLogs, testConfig } from '../../__tests__/support.js';
import { createApp } from '../../app.js';
import { createContainer } from '../../core/container.js';
import { encodeForNotify, MAX_NOTIFY_BYTES } from '../realtime/realtime-bus.js';

import type { AddressInfo } from 'node:net';

interface StreamReader {
  events: { event: string; data: unknown }[];
  waitFor(
    predicate: (e: { event: string; data: unknown }) => boolean,
    ms?: number,
  ): Promise<{ event: string; data: unknown }>;
  close(): void;
}

async function openStream(baseUrl: string, auth: string): Promise<StreamReader> {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/v1/realtime/stream`, {
    headers: { Authorization: auth, Accept: 'text/event-stream' },
    signal: controller.signal,
  });
  if (response.status !== 200 || response.body === null) {
    throw new Error(`stream failed: ${String(response.status)}`);
  }
  const events: { event: string; data: unknown }[] = [];
  const waiters: (() => void)[] = [];
  const decoder = new TextDecoder();
  let buffer = '';
  void (async () => {
    try {
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const event = /^event: (.*)$/m.exec(frame)?.[1];
          const data = /^data: (.*)$/m.exec(frame)?.[1];
          if (event !== undefined && data !== undefined) {
            events.push({ event, data: JSON.parse(data) as unknown });
            waiters.splice(0).forEach((w) => {
              w();
            });
          }
        }
      }
    } catch {
      // aborted
    }
  })();
  return {
    events,
    async waitFor(predicate, ms = 5000) {
      const deadline = Date.now() + ms;
      for (;;) {
        const found = events.find(predicate);
        if (found !== undefined) return found;
        if (Date.now() > deadline) throw new Error('timed out waiting for event');
        await new Promise<void>((resolve) => {
          waiters.push(resolve);
          setTimeout(resolve, 100);
        });
      }
    },
    close: () => {
      controller.abort();
    },
  };
}

const listen = (handler: Parameters<typeof createServer>[1]) =>
  new Promise<{ server: Server; url: string }>((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      resolve({
        server,
        url: `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`,
      });
    });
  });

describe('realtime bus encoding', () => {
  it('truncates oversized events to their ids', () => {
    const encoded = encodeForNotify({
      userIds: ['u1'],
      type: 'message.created',
      data: { conversationId: 'c1', message: { body: 'x'.repeat(10_000) } },
    });
    expect(Buffer.byteLength(encoded)).toBeLessThan(MAX_NOTIFY_BYTES);
    expect(JSON.parse(encoded)).toEqual({
      userIds: ['u1'],
      type: 'message.created',
      data: { conversationId: 'c1', truncated: true },
    });
  });
});

describe('SSE delivery across instances (Postgres LISTEN/NOTIFY)', { timeout: 60_000 }, () => {
  let h: DomainHarness;
  let founder: TestUser;
  let supporter: TestUser;
  let stranger: TestUser;
  let conversationId: string;
  let instanceA: { server: Server; url: string };
  let instanceB: { server: Server; url: string };
  let closeB: () => Promise<void>;

  beforeAll(async () => {
    h = await startDomainHarness('api_realtime', { REALTIME_BUS: 'postgres' });
    founder = await h.createUser({ role: 'founder' });
    supporter = await h.createUser({ role: 'supporter' });
    stranger = await h.createUser({ role: 'supporter' });
    const startup = await publishStartup(h, founder);
    ({ conversationId } = await connect(h, supporter, founder, startup.id));

    instanceA = await listen(h.app);
    const dbUrl = h.container.config.database.url;
    const containerB = createContainer(
      testConfig({ DATABASE_URL: dbUrl, REALTIME_BUS: 'postgres' }),
      {
        logDestination: captureLogs().stream,
      },
    );
    instanceB = await listen(createApp(containerB.appDeps()));
    closeB = async () => {
      for (const hook of containerB.closeHooks) await hook();
    };
  }, 120_000);

  afterAll(async () => {
    instanceA.server.closeAllConnections();
    instanceB.server.closeAllConnections();
    await new Promise((r) => instanceA.server.close(r));
    await new Promise((r) => instanceB.server.close(r));
    await closeB();
    await h.close();
  }, 60_000);

  it('requires authentication', async () => {
    expect((await request(h.app).get('/api/v1/realtime/stream')).status).toBe(401);
  });

  it('pushes a persisted message to the recipient on another instance only', async () => {
    const founderStream = await openStream(instanceB.url, founder.auth);
    const strangerStream = await openStream(instanceB.url, stranger.auth);
    await founderStream.waitFor((e) => e.event === 'ready');
    // Give the LISTEN connection a moment to be established.
    await new Promise((r) => setTimeout(r, 300));

    const sent = await fetch(`${instanceA.url}/api/v1/conversations/${conversationId}/messages`, {
      method: 'POST',
      headers: { Authorization: supporter.auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientMessageId: randomUUID(), body: 'Real-time hello' }),
    });
    expect(sent.status).toBe(201);
    const sentBody = (await sent.json()) as { id: string };

    const event = await founderStream.waitFor((e) => e.event === 'message.created');
    expect(event.data).toMatchObject({
      conversationId,
      message: { id: sentBody.id, body: 'Real-time hello' },
    });
    await founderStream.waitFor((e) => e.event === 'notification.created');

    await new Promise((r) => setTimeout(r, 300));
    expect(strangerStream.events.filter((e) => e.event !== 'ready')).toEqual([]);
    founderStream.close();
    strangerStream.close();
  });
});
