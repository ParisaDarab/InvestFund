import { setTimeout as sleep } from 'node:timers/promises';

import express from 'express';
import { z } from 'zod';

import { CallLog, type CallRecord } from './calls.js';
import {
  buildCompletion,
  ChatCompletionRequest,
  ChatRequestError,
  estimateTokens,
  FIXED_CREATED,
  systemText,
} from './chat.js';
import { ControlState, describeEffect, type ControlEffect } from './control.js';
import { embed, resolveDimensions, toBase64 } from './embeddings.js';
import { FixtureStore, promptKeyFromRequest, PromptKeyError } from './fixtures.js';
import { canonicalJson } from './hash.js';

import type { MockLlmConfig } from './config.js';
import type { Application, NextFunction, Request, Response } from 'express';

const EmbeddingRequest = z.looseObject({
  model: z.string().min(1),
  input: z.union([
    z.string(),
    z.array(z.string()).min(1),
    z.array(z.int()).min(1),
    z.array(z.array(z.int()).min(1)).min(1),
  ]),
  dimensions: z.int().min(1).max(8192).optional(),
  encoding_format: z.enum(['float', 'base64']).optional(),
});

export interface MockLlm {
  app: Application;
  calls: CallLog;
  control: ControlState;
  /** Destroys requests held open by a `timeout` injection (call on shutdown). */
  close(): void;
}

type OpenAiErrorType =
  | 'invalid_request_error'
  | 'authentication_error'
  | 'not_found_error'
  | 'rate_limit_error'
  | 'server_error';

function sendError(
  res: Response,
  status: number,
  type: OpenAiErrorType,
  message: string,
  extra: { code?: string | null; param?: string | null } = {},
): void {
  res.status(status).json({
    error: { message, type, param: extra.param ?? null, code: extra.code ?? null },
  });
}

export function createMockLlm(config: MockLlmConfig): MockLlm {
  const app = express();
  const calls = new CallLog();
  const control = new ControlState();
  let fixtures = FixtureStore.load(config.fixturesDir);
  const held = new Set<Response>();
  const records = new WeakMap<Request, CallRecord>();
  const effects = new WeakMap<Request, ControlEffect>();

  app.disable('x-powered-by');
  app.set('etag', false);

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', fixtures: fixtures.size });
  });

  // ── Test hooks ───────────────────────────────────────────────────────────
  app.get('/__calls', (_req, res) => {
    res.json({ calls: calls.list() });
  });

  app.post('/__reset', (_req, res) => {
    calls.clear();
    control.clear();
    for (const response of held) response.destroy();
    held.clear();
    try {
      fixtures = FixtureStore.load(config.fixturesDir);
    } catch (error) {
      res.status(500).json({ status: 'error', message: String(error) });
      return;
    }
    res.json({ status: 'reset', fixtures: fixtures.size });
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

  // ── OpenAI-compatible API ───────────────────────────────────────────────
  app.use('/v1', async (req, res, next) => {
    const record = calls.start(req.method, req.originalUrl.split('?')[0] ?? req.originalUrl);
    records.set(req, record);
    res.on('finish', () => {
      record.status = res.statusCode;
    });

    const effect = control.take(record.path);
    if (effect !== undefined) {
      record.injected = describeEffect(effect);
      effects.set(req, effect);
      if (effect.latencyMs !== undefined) await sleep(effect.latencyMs);
      if (effect.timeout === true) {
        // Never answer: the client must time out. The socket is destroyed after the hold time.
        held.add(res);
        const timer = setTimeout(() => {
          held.delete(res);
          res.destroy();
        }, config.timeoutHoldMs);
        timer.unref();
        res.on('close', () => {
          clearTimeout(timer);
          held.delete(res);
        });
        return;
      }
      if (effect.fail === 429) {
        res.set('retry-after', String(effect.retryAfter));
        sendError(res, 429, 'rate_limit_error', 'Rate limit reached (mock-llm injected)', {
          code: 'rate_limit_exceeded',
        });
        return;
      }
      if (effect.fail !== undefined) {
        if (effect.fail === 503) res.set('retry-after', String(effect.retryAfter));
        sendError(res, effect.fail, 'server_error', 'Server error (mock-llm injected)');
        return;
      }
    }

    const authorization = req.get('authorization') ?? '';
    if (!/^Bearer \S+/.test(authorization)) {
      sendError(
        res,
        401,
        'authentication_error',
        'Missing bearer API key (any value is accepted)',
        {
          code: 'invalid_api_key',
        },
      );
      return;
    }
    next();
  });

  app.use('/v1', express.json({ limit: '10mb' }));

  app.get('/v1/models', (_req, res) => {
    const ids = [
      ...new Set([...config.chatModels, 'mock-embedding', ...Object.keys(config.embeddingModels)]),
    ];
    res.json({
      object: 'list',
      data: ids.map((id) => ({
        id,
        object: 'model',
        created: FIXED_CREATED,
        owned_by: 'investfund-mock',
      })),
    });
  });

  app.post('/v1/chat/completions', (req, res) => {
    const record = records.get(req);
    const parsed = ChatCompletionRequest.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      sendError(res, 400, 'invalid_request_error', issue?.message ?? 'Invalid request', {
        param: issue?.path.join('.') ?? null,
      });
      return;
    }
    const request = parsed.data;
    try {
      const key = promptKeyFromRequest(req.headers, systemText(request.messages));
      const fixture = key === null ? undefined : fixtures.resolve(key);
      const { completion, source } = buildCompletion(request, fixture, key?.promptId ?? null, {
        malformedJson: effects.get(req)?.malformedJson === true,
      });
      if (record !== undefined) {
        record.model = request.model;
        record.promptId = key?.promptId ?? null;
        record.promptVersion = key?.version ?? null;
        record.varsHash = key?.varsHash ?? null;
        record.fixture = source;
        record.usage = completion.usage;
        if (config.recordContent) record.content = { request, response: completion };
      }
      res.json(completion);
    } catch (error) {
      if (error instanceof ChatRequestError || error instanceof PromptKeyError) {
        sendError(res, 400, 'invalid_request_error', error.message, {
          param: error instanceof ChatRequestError ? error.param : null,
        });
        return;
      }
      throw error;
    }
  });

  app.post('/v1/embeddings', (req, res) => {
    const record = records.get(req);
    const parsed = EmbeddingRequest.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      sendError(res, 400, 'invalid_request_error', issue?.message ?? 'Invalid request', {
        param: issue?.path.join('.') ?? null,
      });
      return;
    }
    const request = parsed.data;
    const { input } = request;
    // A string, a list of strings, one token array (one input) or a list of token arrays.
    const inputs: string[] =
      typeof input === 'string'
        ? [input]
        : input.every((item) => typeof item === 'number')
          ? [canonicalJson(input)]
          : input.map((item) => (typeof item === 'string' ? item : canonicalJson(item)));
    const dimensions = resolveDimensions(
      request.model,
      request.dimensions,
      config.embeddingModels,
      config.embeddingDimensions,
    );
    const promptTokens = inputs.reduce((sum, input) => sum + estimateTokens(input), 0);
    const usage = { prompt_tokens: promptTokens, total_tokens: promptTokens };
    if (record !== undefined) {
      record.model = request.model;
      record.inputCount = inputs.length;
      record.usage = { ...usage, completion_tokens: 0 };
    }
    if (effects.get(req)?.malformedJson === true) {
      res.type('application/json').send('{"object": "list", "data": [');
      return;
    }
    const base64 = request.encoding_format === 'base64';
    res.json({
      object: 'list',
      data: inputs.map((input, index) => {
        const vector = embed(input, dimensions);
        return { object: 'embedding', index, embedding: base64 ? toBase64(vector) : vector };
      }),
      model: request.model,
      usage,
    });
  });

  app.use('/v1', (_req, res) => {
    sendError(res, 404, 'not_found_error', 'Unknown endpoint (mock-llm)', {
      code: 'unknown_url',
    });
  });

  app.use((_req, res) => {
    res.status(404).json({ status: 'error', message: 'Not found' });
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
      sendError(res, status, 'invalid_request_error', 'Request body could not be parsed');
      return;
    }
    console.error('mock-llm: unhandled error', error);
    sendError(res, 500, 'server_error', 'Internal mock error');
  });

  return {
    app,
    calls,
    control,
    close() {
      for (const response of held) response.destroy();
      held.clear();
    },
  };
}
