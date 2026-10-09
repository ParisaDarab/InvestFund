/** Upper bound on retained call records, so a long sandbox run cannot exhaust memory. */
export const MAX_CALLS = 10_000;

/**
 * One recorded request to a Google endpoint (`/health` and `/__*` are not recorded).
 * Secrets (client secrets, codes, tokens, PKCE verifiers) are never recorded. Message bodies are
 * only recorded when `MOCK_RECORD_CONTENT=true`.
 */
export interface CallRecord {
  seq: number;
  method: string;
  path: string;
  status: number | null;
  /** Email of the authenticated (or consenting) user, when known. */
  user: string | null;
  /** Failure injected by `/__control` for this call, if any. */
  injected: string | null;
  /** Endpoint-specific, non-secret details (decoded mail headers, calendar IDs, grant type…). */
  detail: Record<string, unknown> | null;
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
      user: null,
      injected: null,
      detail: null,
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
