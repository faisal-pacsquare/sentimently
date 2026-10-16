import { Global, Logger, Module } from '@nestjs/common';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(mail: Mail): Promise<void>;
}

export const MAILER = Symbol('MAILER');

/**
 * Placeholder mailer: keeps mail in memory and logs it. A real provider (Amazon SES,
 * see Phase0/09_Decisions_Log.md) replaces it by implementing Mailer.
 * Outside production the message body is logged so reset links can be copied during development.
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

@Global()
@Module({
  providers: [{ provide: MAILER, useClass: ConsoleMailer }],
  exports: [MAILER],
})
export class MailModule {}
