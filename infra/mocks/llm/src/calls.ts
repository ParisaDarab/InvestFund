/** Upper bound on retained call records, so a long sandbox run cannot exhaust memory. */
export const MAX_CALLS = 10_000;

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

/**
 * One recorded `/v1/*` request. Fields are `null` until known. Message content is only kept when
 * `MOCK_RECORD_CONTENT=true` (`content`), so the default log never contains prompt text.
 */
export interface CallRecord {
  seq: number;
  method: string;
  path: string;
  status: number | null;
  model: string | null;
  promptId: string | null;
  promptVersion: number | null;
  varsHash: string | null;
  /** Fixture file (relative to the fixtures directory), `fallback`, or `null` (not a completion). */
  fixture: string | null;
  /** Failure injected by `/__control` for this call, if any. */
  injected: string | null;
  usage: Usage | null;
  /** Number of inputs (embeddings only). */
  inputCount: number | null;
  content?: { request: unknown; response: unknown };
}

export class CallLog {
  #records: CallRecord[] = [];
  #seq = 0;

  start(method: string, path: string): CallRecord {
    this.#seq += 1;
    const record: CallRecord = {
      seq: this.#seq,
      method,
      path,
      status: null,
      model: null,
      promptId: null,
      promptVersion: null,
      varsHash: null,
      fixture: null,
      injected: null,
      usage: null,
      inputCount: null,
    };
    this.#records.push(record);
    if (this.#records.length > MAX_CALLS) this.#records.shift();
    return record;
  }

  list(): readonly CallRecord[] {
    return this.#records;
  }

  clear(): void {
    this.#records = [];
    this.#seq = 0;
  }
}
