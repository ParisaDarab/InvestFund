import { setTimeout as sleep } from 'node:timers/promises';

import express from 'express';
import { z } from 'zod';

import { registerCalendar } from './calendar.js';
import { CallLog, type CallRecord } from './calls.js';
import { ControlState, describeEffect, type ControlEffect } from './control.js';
import { headerSummary, registerGmail } from './gmail.js';
import { googleError, oauthError, type Context } from './http.js';
import { headerValue, parseAddressList, type Header } from './mime.js';
import { registerOAuth } from './oauth.js';
import { DEFAULT_SEED } from './seed.js';
import { GoogleState } from './state.js';

import type { MockGoogleConfig } from './config.js';
import type { Application, NextFunction, Request, Response } from 'express';

export const CONSENT_PATH = '/o/oauth2/v2/auth';

const InjectReply = z.strictObject({
  threadId: z.string().min(1),
  /** Sender. Defaults to the first recipient of the thread's last sent message. */
  from: z.email().optional(),
  subject: z.string().optional(),
  body: z.string().default('Thanks for reaching out. I would be happy to talk.'),
});

export interface MockGoogle {
  app: Application;
  calls: CallLog;
  control: ControlState;
  /** Current state (for tests); replaced by `POST /__reset`. */
  state(): GoogleState;
}

function freshState(config: MockGoogleConfig): GoogleState {
  const state = new GoogleState(config.startTime);
  state.seed(DEFAULT_SEED);
  return state;
}

/** Answers a call with the failure injected by `/__control`, shaped for the endpoint family. */
function sendInjectedFailure(path: string, effect: ControlEffect, res: Response): void {
  const { fail } = effect;
  if (fail === undefined) return;
  if (fail === 429 || fail === 503) res.set('retry-after', String(effect.retryAfter));
  const isOAuth = path === '/token' || path === '/revoke';
  if (isOAuth) {
    if (fail === 'invalid_grant') {
      oauthError(res, 400, 'invalid_grant', 'Token has been expired or revoked.');
    } else if (fail === 401) {
      oauthError(res, 401, 'invalid_client', 'Unauthorized');
    } else if (fail === 'access_denied' || fail === 403) {
      oauthError(res, 403, 'access_denied', 'Injected failure (mock-google)');
    } else {
      oauthError(
        res,
        fail,
        fail === 429 ? 'rate_limit_exceeded' : 'temporarily_unavailable',
        'Injected failure (mock-google)',
      );
    }
    return;
  }
  if (path === '/oauth2/v3/userinfo' && (fail === 'invalid_grant' || fail === 401)) {
    oauthError(res, 401, 'invalid_request', 'Invalid Credentials');
    return;
  }
  if (fail === 'invalid_grant' || fail === 401) {
    googleError(res, 401, 'authError', 'Request had invalid authentication credentials.');
  } else if (fail === 'access_denied' || fail === 403) {
    googleError(res, 403, 'forbidden', 'The caller does not have permission');
  } else if (fail === 429) {
    googleError(res, 429, 'rateLimitExceeded', 'Rate Limit Exceeded');
  } else {
    googleError(res, fail, 'backendError', 'Backend Error');
  }
}

export function createMockGoogle(config: MockGoogleConfig): MockGoogle {
  const app = express();
  const calls = new CallLog();
  const control = new ControlState();
  let state = freshState(config);
  const records = new WeakMap<Request, CallRecord>();
  const effects = new WeakMap<Request, ControlEffect>();
  const ctx: Context = {
    config,
    state: () => state,
    record: (req) => records.get(req),
    effect: (req) => effects.get(req),
  };

  app.disable('x-powered-by');
  app.set('etag', false);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // ── Test hooks ───────────────────────────────────────────────────────────
  app.get('/__calls', (_req, res) => {
    res.json({ calls: calls.list() });
  });

  app.post('/__reset', (_req, res) => {
    calls.clear();
    control.clear();
    state = freshState(config);
    res.json({ status: 'reset' });
  });

  app.get('/__control', (_req, res) => {
    res.json({ pending: control.pending() });
  });

  app.post('/__control', express.json({ limit: '16kb' }), (req, res) => {
    try {
      const rule = control.add(req.body);
      res.status(201).json({ status: 'queued', rule, pending: control.pending() });
    } catch (error) {
      const message = error instanceof z.ZodError ? z.prettifyError(error) : String(error);
      res.status(400).json({ status: 'error', message });
    }
  });

  app.post('/__seed', express.json({ limit: '1mb' }), (req, res) => {
    try {
      const result = state.seed(req.body);
      res.status(201).json({
        users: result.users.map(({ sub, email, name }) => ({ sub, email, name })),
        accessTokens: result.accessTokens,
      });
    } catch (error) {
      const message = error instanceof z.ZodError ? z.prettifyError(error) : String(error);
      res.status(400).json({ status: 'error', message });
    }
  });

  app.post('/__inject/reply', express.json({ limit: '1mb' }), (req, res) => {
    const parsed = InjectReply.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ status: 'error', message: z.prettifyError(parsed.error) });
      return;
    }
    const thread = state.threads.get(parsed.data.threadId);
    if (thread === undefined) {
      res.status(404).json({ status: 'error', message: 'Unknown thread' });
      return;
    }
    const messages = thread.messageIds.map((id) => state.messages.get(id));
    const last = messages.at(-1);
    const lastSent = messages.filter((message) => message?.labelIds.includes('SENT')).at(-1);
    const from =
      parsed.data.from ??
      parseAddressList(
        lastSent === undefined ? undefined : headerValue(lastSent.headers, 'To'),
      )[0] ??
      'reply@external.investfund.test';
    const originalSubject = last === undefined ? '' : (headerValue(last.headers, 'Subject') ?? '');
    const lastMessageId = last === undefined ? undefined : headerValue(last.headers, 'Message-ID');
    const headers: Header[] = [
      { name: 'From', value: from },
      { name: 'To', value: thread.owner },
      {
        name: 'Subject',
        value: parsed.data.subject ?? `Re: ${originalSubject.replace(/^(re:\s*)+/i, '')}`,
      },
      { name: 'Date', value: new Date(state.tick()).toUTCString() },
      { name: 'Content-Type', value: 'text/plain; charset=UTF-8' },
    ];
    if (lastMessageId !== undefined) {
      headers.push({ name: 'In-Reply-To', value: lastMessageId });
      headers.push({ name: 'References', value: lastMessageId });
    }
    const stored = state.addMessage(thread.owner, {
      headers,
      body: parsed.data.body,
      labelIds: ['INBOX', 'UNREAD'],
      threadId: thread.id,
    });
    headers.push({ name: 'Message-ID', value: `<${stored.id}@mail.investfund.test>` });
    res.status(201).json({
      id: stored.id,
      threadId: stored.threadId,
      historyId: String(stored.historyId),
      headers: headerSummary(headers),
    });
  });

  // ── Recording and failure injection for every Google endpoint ───────────
  app.use(async (req, res, next) => {
    const record = calls.start(req.method, req.path);
    records.set(req, record);
    res.on('finish', () => {
      record.status = res.statusCode;
    });
    const effect = control.take(req.path);
    if (effect === undefined) {
      next();
      return;
    }
    record.injected = describeEffect(effect);
    effects.set(req, effect);
    if (effect.latencyMs !== undefined) await sleep(effect.latencyMs);
    // The consent endpoint applies its failure itself (it redirects back with an error).
    if (effect.fail === undefined || req.path === CONSENT_PATH) {
      next();
      return;
    }
    sendInjectedFailure(req.path, effect, res);
  });

  registerOAuth(app, ctx);
  registerGmail(app, ctx);
  registerCalendar(app, ctx);

  app.use((_req, res) => {
    googleError(res, 404, 'notFound', 'Not Found (mock-google)');
  });

  app.use((error: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(error);
      return;
    }
    const status =
      error !== null &&
      typeof error === 'object' &&
      'status' in error &&
      typeof error.status === 'number'
        ? error.status
        : 500;
    if (status >= 400 && status < 500) {
      googleError(res, status, 'parseError', 'Request body could not be parsed');
      return;
    }
    console.error('mock-google: unhandled error', error);
    googleError(res, 500, 'backendError', 'Internal mock error');
  });

  return { app, calls, control, state: () => state };
}
