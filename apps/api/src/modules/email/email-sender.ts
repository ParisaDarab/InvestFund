/**
 * Transactional email transport behind a small interface (adapter pattern).
 *
 * - `SmtpEmailSender`: any SMTP provider (Mailpit locally; Postmark, Resend, SES, Brevo... in
 *   production via their SMTP endpoints).
 * - `LogEmailSender`: development default when no provider is configured. It records that an
 *   email *would* have been sent (template and outbox id only, never the address or body) and
 *   reports `skipped`, so nothing is ever claimed as delivered.
 */
import nodemailer from 'nodemailer';

import type { EmailConfig } from '../../core/config/config.js';
import type { Logger } from '../../core/logger/logger.js';

export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

export type SendResult = 'sent' | 'skipped';

export interface EmailSender {
  send(
    message: EmailMessage,
    meta: { readonly outboxId: string; readonly template: string },
  ): Promise<SendResult>;
}

export class SmtpEmailSender implements EmailSender {
  readonly #transport: nodemailer.Transporter;

  constructor(
    smtp: NonNullable<EmailConfig['smtp']>,
    private readonly from: string,
  ) {
    this.#transport = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      ...(smtp.user === undefined ? {} : { auth: { user: smtp.user, pass: smtp.password ?? '' } }),
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(message: EmailMessage): Promise<SendResult> {
    await this.#transport.sendMail({ from: this.from, ...message });
    return 'sent';
  }
}

export class LogEmailSender implements EmailSender {
  constructor(private readonly logger: Logger) {}

  send(_message: EmailMessage, meta: { outboxId: string; template: string }): Promise<SendResult> {
    this.logger.info(
      { outboxId: meta.outboxId, template: meta.template },
      'email not delivered: EMAIL_DELIVERY=log (no provider configured)',
    );
    return Promise.resolve('skipped');
  }
}

/** In-memory sender for tests. */
export class RecordingEmailSender implements EmailSender {
  readonly sent: EmailMessage[] = [];
  failNext = 0;

  send(message: EmailMessage): Promise<SendResult> {
    if (this.failNext > 0) {
      this.failNext -= 1;
      return Promise.reject(new Error('simulated SMTP failure'));
    }
    this.sent.push(message);
    return Promise.resolve('sent');
  }
}
