/**
 * Server-Sent Events hub: holds each process's open streams by user and forwards bus events to
 * the addressed users. A stream is opened by an authenticated request, so the server alone
 * decides what each user receives.
 */
import type { RealtimeBus, RealtimeEvent } from './realtime-bus.js';
import type { Response } from 'express';

/** Comment line sent periodically so proxies do not close idle streams. */
export const HEARTBEAT_MS = 25_000;
/** Most concurrent streams per user (tabs/devices). */
export const MAX_STREAMS_PER_USER = 10;

export class RealtimeHub {
  readonly #streams = new Map<string, Set<Response>>();
  readonly #unsubscribe: () => void;
  readonly #heartbeat: NodeJS.Timeout;
  #eventId = 0;

  constructor(private readonly bus: RealtimeBus) {
    this.#unsubscribe = bus.subscribe((event) => {
      this.deliver(event);
    });
    this.#heartbeat = setInterval(() => {
      this.broadcastComment('ping');
    }, HEARTBEAT_MS);
    this.#heartbeat.unref();
  }

  /** Registers an SSE response; returns false when the user has too many streams. */
  attach(userId: string, res: Response): boolean {
    const set = this.#streams.get(userId) ?? new Set<Response>();
    if (set.size >= MAX_STREAMS_PER_USER) return false;
    set.add(res);
    this.#streams.set(userId, set);
    res.on('close', () => {
      this.detach(userId, res);
    });
    return true;
  }

  /** Ends every stream of a user (suspension, sign-out everywhere). */
  disconnectUser(userId: string): void {
    for (const res of this.#streams.get(userId) ?? []) res.end();
    this.#streams.delete(userId);
  }

  connectionCount(userId?: string): number {
    if (userId !== undefined) return this.#streams.get(userId)?.size ?? 0;
    let total = 0;
    for (const set of this.#streams.values()) total += set.size;
    return total;
  }

  publish(event: RealtimeEvent): Promise<void> {
    return this.bus.publish(event);
  }

  close(): void {
    clearInterval(this.#heartbeat);
    this.#unsubscribe();
    for (const set of this.#streams.values()) for (const res of set) res.end();
    this.#streams.clear();
  }

  private detach(userId: string, res: Response): void {
    const set = this.#streams.get(userId);
    if (set === undefined) return;
    set.delete(res);
    if (set.size === 0) this.#streams.delete(userId);
  }

  private deliver(event: RealtimeEvent): void {
    const payload = JSON.stringify(event.data);
    this.#eventId += 1;
    const frame = `id: ${String(this.#eventId)}\nevent: ${event.type}\ndata: ${payload}\n\n`;
    for (const userId of new Set(event.userIds)) {
      for (const res of this.#streams.get(userId) ?? []) res.write(frame);
    }
  }

  private broadcastComment(text: string): void {
    for (const set of this.#streams.values()) for (const res of set) res.write(`: ${text}\n\n`);
  }
}
