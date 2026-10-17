import { Global, Logger, Module } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  text: string;
  /** Where a reply should go (for example the customer who wrote to us). */
  replyTo?: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/**
 * Keeps mail in memory and logs it. Used when no email service is set up (development and tests).
 * Outside production the message body is logged so reset links can be copied.
 */
export class ConsoleMailer implements Mailer {
  readonly outbox: Mail[] = [];
  private readonly logger = new Logger('Mailer');

  async send(mail: Mail) {
    this.outbox.push(mail);
    const body = process.env.NODE_ENV === 'production' ? '' : `\n${mail.text}`;
    this.logger.log(`to=${mail.to} subject="${mail.subject}"${body}`);
  }
}

export type MailProvider = 'brevo' | 'resend';

export interface HttpMailerConfig {
  provider: MailProvider;
  apiKey: string;
  /** The sender address. It must be one the email service has verified for you. */
  from: string;
  fromName: string;
}

const TIMEOUT_MS = 10_000;

/** One line, no control characters: safe to use as a subject or a name. */
const oneLine = (s: string) =>
  // eslint-disable-next-line no-control-regex
  s.replace(/[\u0000-\u001f\u007f]+/g, ' ').trim();

/**
 * Sends real email through a free email service over HTTPS (no extra packages).
 *
 *  - Brevo  (free: 300 emails a day). Verify one sender address in the dashboard; no domain needed.
 *  - Resend (free: 100 a day). Without your own domain it can only send to the address you signed up with.
 *
 * A failed send throws, so callers can decide whether it matters (a sign-up must not fail because email is down).
 */
export class HttpMailer implements Mailer {
  private readonly logger = new Logger('Mailer');

  constructor(
    private readonly cfg: HttpMailerConfig,
    private readonly http: typeof fetch = fetch,
  ) {}

  get provider() {
    return this.cfg.provider;
  }

  async send(mail: Mail): Promise<void> {
    const { provider, apiKey, from, fromName } = this.cfg;
    const subject = oneLine(mail.subject);
    const request: {
      url: string;
      headers: Record<string, string>;
      body: unknown;
    } =
      provider === 'brevo'
        ? {
            url: 'https://api.brevo.com/v3/smtp/email',
            headers: { 'api-key': apiKey },
            body: {
              sender: { name: fromName, email: from },
              to: [{ email: mail.to }],
              subject,
              textContent: mail.text,
              ...(mail.replyTo ? { replyTo: { email: mail.replyTo } } : {}),
            },
          }
        : {
            url: 'https://api.resend.com/emails',
            headers: { Authorization: `Bearer ${apiKey}` },
            body: {
              from: `${oneLine(fromName)} <${from}>`,
              to: [mail.to],
              subject,
              text: mail.text,
              ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
            },
          };

    let res: Response;
    try {
      res = await this.http(request.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json',
          ...request.headers,
        },
        body: JSON.stringify(request.body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (e) {
      throw new Error(`${provider} could not be reached: ${String(e)}`);
    }
    if (!res.ok) {
      // The service explains what is wrong (unverified sender, bad key...). Log that; never log the key.
      const detail = (await res.text().catch(() => '')).slice(0, 300);
      this.logger.error(
        `${provider} refused the email (${res.status}): ${detail}`,
      );
      throw new Error(`${provider} refused the email (${res.status})`);
    }
  }
}

/** Picks the sender from the environment: a real service when its key is set, otherwise the console. */
export function createMailer(env: NodeJS.ProcessEnv = process.env): Mailer {
  const provider: MailProvider | undefined =
    env.MAIL_PROVIDER === 'resend' || env.MAIL_PROVIDER === 'brevo'
      ? env.MAIL_PROVIDER
      : env.BREVO_API_KEY
        ? 'brevo'
        : env.RESEND_API_KEY
          ? 'resend'
          : undefined;
  const apiKey = provider === 'brevo' ? env.BREVO_API_KEY : env.RESEND_API_KEY;
  if (!provider || !apiKey || !env.MAIL_FROM) {
    if (provider) {
      new Logger('Mailer').warn(
        `${provider} is chosen but ${apiKey ? 'MAIL_FROM' : 'its API key'} is missing: emails are only being logged`,
      );
    }
    return new ConsoleMailer();
  }
  return new HttpMailer({
    provider,
    apiKey,
    from: env.MAIL_FROM,
    fromName: env.MAIL_FROM_NAME || 'Bloomora',
  });
}

@Global()
@Module({
  providers: [{ provide: MAILER, useFactory: () => createMailer() }],
  exports: [MAILER],
})
export class MailModule {}
