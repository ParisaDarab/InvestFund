import express from 'express';
import { z } from 'zod';

import {
  authenticate,
  googleError,
  isOwnMailbox,
  queryParam,
  queryParams,
  type Context,
} from './http.js';
import {
  decodeBase64Url,
  encodeBase64Url,
  headerValue,
  MimeError,
  parseAddressList,
  parseRfc2822,
  type Header,
} from './mime.js';
import { ACCEPTED_SCOPES, type MailMessage } from './state.js';

import type { Application } from 'express';

const SendBody = z.looseObject({
  raw: z.string().min(1),
  threadId: z.string().min(1).optional(),
});

/** Non-secret summary of a message's headers, as recorded in `/__calls`. */
export function headerSummary(headers: readonly Header[]): Record<string, string | null> {
  const get = (name: string): string | null => headerValue(headers, name) ?? null;
  return {
    from: get('From'),
    to: get('To'),
    cc: get('Cc'),
    bcc: get('Bcc'),
    subject: get('Subject'),
    messageId: get('Message-ID'),
    inReplyTo: get('In-Reply-To'),
    references: get('References'),
  };
}

function snippet(message: MailMessage): string {
  const contentType = headerValue(message.headers, 'Content-Type') ?? 'text/plain';
  const encoding = headerValue(message.headers, 'Content-Transfer-Encoding') ?? '7bit';
  if (!contentType.toLowerCase().startsWith('text/plain') || /base64/i.test(encoding)) return '';
  return message.body.replace(/\s+/g, ' ').trim().slice(0, 100);
}

function toApiMessage(
  message: MailMessage,
  format: string,
  metadataHeaders: readonly string[],
): Record<string, unknown> {
  const base = {
    id: message.id,
    threadId: message.threadId,
    labelIds: message.labelIds,
    snippet: snippet(message),
    historyId: String(message.historyId),
    internalDate: String(message.internalDate),
    sizeEstimate: Buffer.byteLength(message.body) + 200,
  };
  if (format === 'minimal') return base;
  const wanted = metadataHeaders.map((name) => name.toLowerCase());
  const headers =
    format === 'metadata' && wanted.length > 0
      ? message.headers.filter((header) => wanted.includes(header.name.toLowerCase()))
      : message.headers;
  const size = Buffer.byteLength(message.body);
  return {
    ...base,
    payload: {
      partId: '',
      mimeType: headerValue(message.headers, 'Content-Type')?.split(';')[0]?.trim() ?? 'text/plain',
      filename: '',
      headers,
      body: format === 'full' ? { size, data: encodeBase64Url(message.body) } : { size },
    },
  };
}

export function registerGmail(app: Application, ctx: Context): void {
  app.post('/gmail/v1/users/:userId/messages/send', express.json({ limit: '36mb' }), (req, res) => {
    const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.gmailSend);
    if (auth === null) return;
    if (!isOwnMailbox(req.params.userId, auth.user)) {
      googleError(res, 403, 'forbidden', 'Delegation denied for ' + auth.user.email);
      return;
    }
    const parsed = SendBody.safeParse(req.body);
    if (!parsed.success) {
      googleError(
        res,
        400,
        'invalidArgument',
        "'raw' RFC822 payload message string or uploading message via /upload/* URL required",
      );
      return;
    }
    let message;
    try {
      message = parseRfc2822(decodeBase64Url(parsed.data.raw).toString('utf8'));
    } catch (error) {
      if (!(error instanceof MimeError)) throw error;
      googleError(res, 400, 'invalidArgument', `Invalid raw message: ${error.message}`);
      return;
    }
    const recipients = ['To', 'Cc', 'Bcc'].flatMap((name) =>
      parseAddressList(headerValue(message.headers, name)),
    );
    if (recipients.length === 0) {
      googleError(res, 400, 'invalidArgument', 'Recipient address required');
      return;
    }
    const state = ctx.state();
    const { threadId } = parsed.data;
    if (threadId !== undefined && state.threads.get(threadId)?.owner !== auth.user.email) {
      googleError(res, 404, 'notFound', 'Requested entity was not found.');
      return;
    }
    const headers = [...message.headers];
    if (headerValue(headers, 'From') === undefined) {
      headers.unshift({ name: 'From', value: auth.user.email });
    }
    const stored = state.addMessage(auth.user.email, {
      headers,
      body: message.body,
      labelIds: ['SENT'],
      ...(threadId === undefined ? {} : { threadId }),
    });
    if (headerValue(headers, 'Message-ID') === undefined) {
      headers.push({ name: 'Message-ID', value: `<${stored.id}@mail.investfund.test>` });
    }
    const record = ctx.record(req);
    if (record !== undefined) {
      record.detail = {
        messageId: stored.id,
        threadId: stored.threadId,
        recipients,
        headers: headerSummary(headers),
        ...(ctx.config.recordContent ? { body: message.body } : {}),
      };
    }
    res.json({ id: stored.id, threadId: stored.threadId, labelIds: stored.labelIds });
  });

  app.get('/gmail/v1/users/:userId/history', (req, res) => {
    const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.gmailRead);
    if (auth === null) return;
    if (!isOwnMailbox(req.params.userId, auth.user)) {
      googleError(res, 403, 'forbidden', 'Delegation denied for ' + auth.user.email);
      return;
    }
    const start = queryParam(req, 'startHistoryId');
    if (start === undefined || !/^\d{1,20}$/.test(start)) {
      googleError(res, 400, 'invalidArgument', 'Invalid startHistoryId');
      return;
    }
    const maxResults = Math.min(Math.max(Number(queryParam(req, 'maxResults') ?? 100), 1), 500);
    const offset = Number(queryParam(req, 'pageToken') ?? 0);
    const labelId = queryParam(req, 'labelId');
    const types = queryParams(req, 'historyTypes');
    const state = ctx.state();
    const records = (state.history.get(auth.user.email) ?? []).filter(
      (entry) =>
        entry.id > Number(start) &&
        (labelId === undefined || entry.labelIds.includes(labelId)) &&
        (types.length === 0 || types.includes('messageAdded')),
    );
    const page = records.slice(offset, offset + maxResults);
    const record = ctx.record(req);
    if (record !== undefined) record.detail = { startHistoryId: start, returned: page.length };
    res.json({
      ...(page.length === 0
        ? {}
        : {
            history: page.map((entry) => ({
              id: String(entry.id),
              messages: [{ id: entry.messageId, threadId: entry.threadId }],
              messagesAdded: [
                {
                  message: {
                    id: entry.messageId,
                    threadId: entry.threadId,
                    labelIds: entry.labelIds,
                  },
                },
              ],
            })),
          }),
      ...(offset + maxResults < records.length
        ? { nextPageToken: String(offset + maxResults) }
        : {}),
      historyId: String(state.mailboxHistoryId.get(auth.user.email) ?? 0),
    });
  });

  app.get('/gmail/v1/users/:userId/threads/:id', (req, res) => {
    const auth = authenticate(ctx, req, res, ACCEPTED_SCOPES.gmailRead);
    if (auth === null) return;
    const state = ctx.state();
    const thread = state.threads.get(req.params.id);
    if (!isOwnMailbox(req.params.userId, auth.user) || thread?.owner !== auth.user.email) {
      googleError(res, 404, 'notFound', 'Requested entity was not found.');
      return;
    }
    const format = queryParam(req, 'format') ?? 'full';
    if (!['full', 'metadata', 'minimal'].includes(format)) {
      googleError(res, 400, 'invalidArgument', `Invalid format: ${format}`);
      return;
    }
    const messages = thread.messageIds
      .map((id) => state.messages.get(id))
      .filter((message) => message !== undefined);
    const record = ctx.record(req);
    if (record !== undefined) record.detail = { threadId: thread.id, messages: messages.length };
    res.json({
      id: thread.id,
      historyId: String(Math.max(...messages.map((message) => message.historyId))),
      messages: messages.map((message) =>
        toApiMessage(message, format, queryParams(req, 'metadataHeaders')),
      ),
    });
  });
}
