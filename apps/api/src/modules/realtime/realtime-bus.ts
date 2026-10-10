/**
 * Real-time fan-out between API processes (ADR 0003).
 *
 * Producers publish *after* their transaction commits. Each process's `RealtimeHub` subscribes
 * and writes the event to the SSE streams of the addressed users only: there are no
 * client-chosen channel names, so a client can never subscribe to someone else's events.
 *
 * - `MemoryRealtimeBus`: one process (tests, single-instance deployments).
 * - `PostgresRealtimeBus`: PostgreSQL `LISTEN/NOTIFY`, so several API instances behind a load
 *   balancer all see every event without an extra broker. NOTIFY payloads are capped at 8000
 *   bytes; larger events are sent as a reference (`truncated: true`) and clients refetch.
 */
import { EventEmitter } from 'node:events';

import pg from 'pg';

import type { Logger } from '../../core/logger/logger.js';

export interface RealtimeEvent {
  /** Recipients. */
  readonly userIds: readonly string[];
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeBus {
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(listener: RealtimeListener): () => void;
  close(): Promise<void>;
}

export class MemoryRealtimeBus implements RealtimeBus {
  readonly #emitter = new EventEmitter().setMaxListeners(0);

  publish(event: RealtimeEvent): Promise<void> {
    this.#emitter.emit('event', event);
    return Promise.resolve();
  }

  subscribe(listener: RealtimeListener): () => void {
    this.#emitter.on('event', listener);
    return () => this.#emitter.off('event', listener);
  }

  close(): Promise<void> {
    this.#emitter.removeAllListeners();
    return Promise.resolve();
  }
}

export const REALTIME_CHANNEL = 'investfund_realtime';
/** Keep well under PostgreSQL's 8000-byte NOTIFY limit. */
export const MAX_NOTIFY_BYTES = 7000;

/** Serialises an event for NOTIFY, dropping `data` (except ids) when it is too large. */
export function encodeForNotify(event: RealtimeEvent): string {
  const full = JSON.stringify(event);
  if (Buffer.byteLength(full, 'utf8') <= MAX_NOTIFY_BYTES) return full;
  const ids = Object.fromEntries(
    Object.entries(event.data).filter(
      ([key, value]) => key.endsWith('Id') && typeof value === 'string',
    ),
  );
  return JSON.stringify({ ...event, data: { ...ids, truncated: true } });
}

export class PostgresRealtimeBus implements RealtimeBus {
  readonly #local = new MemoryRealtimeBus();
  #client: pg.Client | null = null;
  #connecting: Promise<void> | null = null;
  #closed = false;
  #retryTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly databaseUrl: string,
    private readonly logger: Logger,
  ) {}

  async publish(event: RealtimeEvent): Promise<void> {
    await this.ensureConnected();
    const client = this.#client;
    if (client === null) throw new Error('realtime bus is not connected');
    await client.query('SELECT pg_notify($1, $2)', [REALTIME_CHANNEL, encodeForNotify(event)]);
  }

  subscribe(listener: RealtimeListener): () => void {
    void this.ensureConnected().catch(() => undefined);
    return this.#local.subscribe(listener);
  }

  async close(): Promise<void> {
    this.#closed = true;
    if (this.#retryTimer !== null) clearTimeout(this.#retryTimer);
    await this.#local.close();
    const client = this.#client;
    this.#client = null;
    await client?.end().catch(() => undefined);
  }

  private ensureConnected(): Promise<void> {
    if (this.#client !== null) return Promise.resolve();
    this.#connecting ??= this.connect().finally(() => {
      this.#connecting = null;
    });
    return this.#connecting;
  }

  private async connect(): Promise<void> {
    const client = new pg.Client({ connectionString: this.databaseUrl });
    client.on('notification', (message) => {
      if (message.channel !== REALTIME_CHANNEL || message.payload === undefined) return;
      try {
        void this.#local.publish(JSON.parse(message.payload) as RealtimeEvent);
      } catch {
        this.logger.warn('realtime: dropped a malformed notification');
      }
    });
    client.on('error', (err) => {
      this.logger.warn({ err: { message: err.message } }, 'realtime: listener connection lost');
      this.#client = null;
      void client.end().catch(() => undefined);
      this.scheduleReconnect();
    });
    await client.connect();
    await client.query(`LISTEN ${REALTIME_CHANNEL}`);
    if (this.#closed) {
      await client.end();
      return;
    }
    this.#client = client;
  }

  private scheduleReconnect(): void {
    if (this.#closed || this.#retryTimer !== null) return;
    this.#retryTimer = setTimeout(() => {
      this.#retryTimer = null;
      this.ensureConnected().catch(() => {
        this.scheduleReconnect();
      });
    }, 2000);
    this.#retryTimer.unref();
  }
}
