import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { MAILER, Mailer } from '../mail/mailer';

/**
 * Things that need a person: a gift that would not send, a refund past its deadline, a double failed delivery.
 * Always logged; also emailed to ALERT_EMAIL when that is set.
 */
@Injectable()
export class AlertsService {
  private readonly logger = new Logger('Alerts');

  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  async raise(subject: string, detail: string) {
    this.logger.error(`${subject}: ${detail}`);
    const to = process.env.ALERT_EMAIL;
    if (!to) return;
    try {
      await this.mailer.send({
        to,
        subject: `[Bloomora alert] ${subject}`,
        text: detail,
      });
    } catch (e) {
      this.logger.error(`Could not email the alert: ${String(e)}`);
    }
  }
}

@Global()
@Module({ providers: [AlertsService], exports: [AlertsService] })
export class AlertsModule {}
