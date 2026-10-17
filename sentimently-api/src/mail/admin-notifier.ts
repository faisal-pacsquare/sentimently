import { Inject, Injectable, Logger } from '@nestjs/common';
import { JsonStore } from '../storage/json-store.service';
import { Doc } from '../storage/storage.types';
import { MAILER, Mailer } from './mailer';

/**
 * Tells the shop's people about something that needs them: a message from the contact form, a return request.
 *
 * Who is told: CONTACT_TO, else ALERT_EMAIL, else the shop email in Settings, else ADMIN_EMAIL.
 * The thing itself is always saved first (in the studio inbox, the returns list), so this is a nudge:
 * if email is down or nobody is set up to receive it, it logs why and carries on. It never throws.
 */
@Injectable()
export class AdminNotifier {
  private readonly logger = new Logger('AdminNotifier');

  constructor(
    private readonly store: JsonStore,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  async recipient(): Promise<string | undefined> {
    const config = await this.store.get<Doc & { contactEmail?: string | null }>(
      'storeConfig',
      'main',
    );
    return (
      process.env.CONTACT_TO ||
      process.env.ALERT_EMAIL ||
      config?.contactEmail ||
      process.env.ADMIN_EMAIL ||
      undefined
    );
  }

  /** Returns true when an email was handed to the mail service. */
  async notify(mail: {
    subject: string;
    text: string;
    replyTo?: string;
  }): Promise<boolean> {
    try {
      const to = await this.recipient();
      if (!to) {
        this.logger.warn(
          `Nobody to email "${mail.subject}" to: set CONTACT_TO on the API`,
        );
        return false;
      }
      await this.mailer.send({ to, ...mail });
      return true;
    } catch (e) {
      this.logger.error(`Could not email "${mail.subject}": ${String(e)}`);
      return false;
    }
  }
}
