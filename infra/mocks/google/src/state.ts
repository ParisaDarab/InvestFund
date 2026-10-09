import { createHash } from 'node:crypto';

import { SeedInput } from './seed.js';
import { parseRfc3339, type Interval } from './time.js';

import type { Header } from './mime.js';
import type { PkceMethod } from './pkce.js';

export const SCOPE = {
  gmailSend: 'https://www.googleapis.com/auth/gmail.send',
  gmailCompose: 'https://www.googleapis.com/auth/gmail.compose',
  gmailReadonly: 'https://www.googleapis.com/auth/gmail.readonly',
  gmailModify: 'https://www.googleapis.com/auth/gmail.modify',
  mailFull: 'https://mail.google.com/',
  calendar: 'https://www.googleapis.com/auth/calendar',
  calendarEvents: 'https://www.googleapis.com/auth/calendar.events',
  calendarReadonly: 'https://www.googleapis.com/auth/calendar.readonly',
  calendarFreebusy: 'https://www.googleapis.com/auth/calendar.freebusy',
  calendarEventsFreebusy: 'https://www.googleapis.com/auth/calendar.events.freebusy',
  userinfoEmail: 'https://www.googleapis.com/auth/userinfo.email',
  userinfoProfile: 'https://www.googleapis.com/auth/userinfo.profile',
} as const;

/** Any one of these scopes authorises the operation (as in the Google API reference). */
export const ACCEPTED_SCOPES = {
  gmailSend: [SCOPE.gmailSend, SCOPE.gmailCompose, SCOPE.gmailModify, SCOPE.mailFull],
  gmailRead: [SCOPE.gmailReadonly, SCOPE.gmailModify, SCOPE.mailFull],
  freeBusy: [
    SCOPE.calendar,
    SCOPE.calendarReadonly,
    SCOPE.calendarFreebusy,
    SCOPE.calendarEventsFreebusy,
    SCOPE.calendarEvents,
  ],
  events: [SCOPE.calendar, SCOPE.calendarEvents],
} as const;

export interface User {
  sub: string;
  email: string;
  name: string;
  givenName: string | null;
  familyName: string | null;
  picture: string | null;
  busy: Interval[];
}

export interface AuthCode {
  clientId: string;
  redirectUri: string;
  email: string;
  scopes: string[];
  challenge: { value: string; method: PkceMethod } | null;
  offline: boolean;
  used: boolean;
}

export interface Grant {
  email: string;
  clientId: string;
  scopes: string[];
  revoked: boolean;
  /** Refresh token this access token was minted from, if any. */
  refreshToken: string | null;
}

export interface MailMessage {
  id: string;
  threadId: string;
  owner: string;
  labelIds: string[];
  headers: Header[];
  body: string;
  internalDate: number;
  historyId: number;
}

export interface HistoryRecord {
  id: number;
  messageId: string;
  threadId: string;
  labelIds: string[];
}

export interface CalendarEvent {
  id: string;
  calendar: string;
  status: 'confirmed' | 'cancelled';
  start: number;
  end: number;
  transparent: boolean;
  resource: Record<string, unknown>;
}

/** Derives a stable 21-digit Google-style `sub` from an email address. */
export function subFromEmail(email: string): string {
  const digits = BigInt(`0x${createHash('sha256').update(email).digest('hex').slice(0, 16)}`)
    .toString()
    .padStart(20, '0')
    .slice(0, 20);
  return `1${digits}`;
}

const pad = (value: number, length: number): string => String(value).padStart(length, '0');

/**
 * In-memory state of the mock. Every identifier comes from a counter and every timestamp from a
 * fixed clock that advances one second per created object, so a given sequence of calls always
 * yields the same IDs, tokens and dates.
 */
export class GoogleState {
  readonly users = new Map<string, User>();
  /** Scopes granted per `<clientId> <email>` (for `include_granted_scopes` and `prompt=none`). */
  readonly consents = new Map<string, Set<string>>();
  readonly codes = new Map<string, AuthCode>();
  readonly accessTokens = new Map<string, Grant>();
  readonly refreshTokens = new Map<string, Grant>();
  readonly messages = new Map<string, MailMessage>();
  readonly threads = new Map<string, { id: string; owner: string; messageIds: string[] }>();
  readonly history = new Map<string, HistoryRecord[]>();
  readonly mailboxHistoryId = new Map<string, number>();
  readonly events = new Map<string, CalendarEvent>();
  #clock: number;
  #counters = { code: 0, access: 0, refresh: 0, message: 0, event: 0, history: 1000 };

  constructor(startTime: number) {
    this.#clock = startTime;
  }

  /** Advances the fixed clock by one second and returns it. */
  tick(): number {
    this.#clock += 1000;
    return this.#clock;
  }

  seed(input: unknown): { users: User[]; accessTokens: number } {
    const parsed = SeedInput.parse(input);
    const users = parsed.users.map((seedUser) => {
      const user: User = {
        sub: seedUser.sub ?? subFromEmail(seedUser.email),
        email: seedUser.email,
        name: seedUser.name,
        givenName: seedUser.givenName ?? null,
        familyName: seedUser.familyName ?? null,
        picture: seedUser.picture ?? null,
        busy: seedUser.busy.map((block) => ({
          start: parseRfc3339(block.start) ?? 0,
          end: parseRfc3339(block.end) ?? 0,
        })),
      };
      this.users.set(user.email, user);
      if (!this.mailboxHistoryId.has(user.email)) {
        this.mailboxHistoryId.set(user.email, this.#counters.history);
      }
      return user;
    });
    for (const token of parsed.accessTokens) {
      if (!this.users.has(token.email)) {
        throw new Error(`accessTokens: unknown user ${token.email} (seed the user first)`);
      }
      this.accessTokens.set(token.token, {
        email: token.email,
        clientId: 'seeded',
        scopes: token.scopes,
        revoked: false,
        refreshToken: null,
      });
    }
    return { users, accessTokens: parsed.accessTokens.length };
  }

  nextCode(): string {
    this.#counters.code += 1;
    return `4/0mock-code-${pad(this.#counters.code, 6)}`;
  }

  issueAccessToken(grant: Omit<Grant, 'revoked'>): string {
    this.#counters.access += 1;
    const token = `ya29.mock-access-${pad(this.#counters.access, 6)}`;
    this.accessTokens.set(token, { ...grant, revoked: false });
    return token;
  }

  issueRefreshToken(grant: Omit<Grant, 'revoked' | 'refreshToken'>): string {
    this.#counters.refresh += 1;
    const token = `1//0mock-refresh-${pad(this.#counters.refresh, 6)}`;
    this.refreshTokens.set(token, { ...grant, revoked: false, refreshToken: null });
    return token;
  }

  /** Revokes a token. Revoking a refresh token also revokes the access tokens minted from it. */
  revoke(token: string): boolean {
    const access = this.accessTokens.get(token);
    if (access !== undefined && !access.revoked) {
      access.revoked = true;
      return true;
    }
    const refresh = this.refreshTokens.get(token);
    if (refresh !== undefined && !refresh.revoked) {
      refresh.revoked = true;
      for (const grant of this.accessTokens.values()) {
        if (grant.refreshToken === token) grant.revoked = true;
      }
      this.consents.delete(`${refresh.clientId} ${refresh.email}`);
      return true;
    }
    return false;
  }

  /** Adds a message to `owner`'s mailbox (new thread unless `threadId` names one of theirs). */
  addMessage(
    owner: string,
    message: { headers: Header[]; body: string; labelIds: string[]; threadId?: string },
  ): MailMessage {
    this.#counters.message += 1;
    this.#counters.history += 1;
    const id = `19a${this.#counters.message.toString(16).padStart(13, '0')}`;
    const existing =
      message.threadId === undefined ? undefined : this.threads.get(message.threadId);
    const thread = existing?.owner === owner ? existing : { id, owner, messageIds: [] as string[] };
    thread.messageIds.push(id);
    this.threads.set(thread.id, thread);

    const stored: MailMessage = {
      id,
      threadId: thread.id,
      owner,
      labelIds: message.labelIds,
      headers: message.headers,
      body: message.body,
      internalDate: this.tick(),
      historyId: this.#counters.history,
    };
    this.messages.set(id, stored);
    const records = this.history.get(owner) ?? [];
    records.push({
      id: stored.historyId,
      messageId: id,
      threadId: thread.id,
      labelIds: stored.labelIds,
    });
    this.history.set(owner, records);
    this.mailboxHistoryId.set(owner, stored.historyId);
    return stored;
  }

  nextEventId(): string {
    this.#counters.event += 1;
    // Calendar event IDs use base32hex characters (a–v, 0–9).
    return `mockevt${pad(this.#counters.event, 6)}`;
  }
}
