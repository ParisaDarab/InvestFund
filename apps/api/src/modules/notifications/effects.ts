/**
 * Side effects collected during a transaction and released only after it commits, so a
 * rolled-back change never produces a real-time event.
 */
import type { Logger } from '../../core/logger/logger.js';
import type { RealtimeEvent } from '../realtime/realtime-bus.js';

export interface EventPublisher {
  publish(event: RealtimeEvent): Promise<void>;
}

export class Effects {
  readonly #events: RealtimeEvent[] = [];

  emit(event: RealtimeEvent): void {
    this.#events.push(event);
  }

  get events(): readonly RealtimeEvent[] {
    return this.#events;
  }

  /** Publishes every event. Failures are logged, never thrown: the data is already persisted. */
  async flush(publisher: EventPublisher, logger: Logger): Promise<void> {
    for (const event of this.#events.splice(0)) {
      try {
        await publisher.publish(event);
      } catch (error) {
        logger.warn(
          {
            err: { message: error instanceof Error ? error.message : String(error) },
            type: event.type,
          },
          'realtime publish failed',
        );
      }
    }
  }
}
