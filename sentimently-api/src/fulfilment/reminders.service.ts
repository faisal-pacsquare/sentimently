import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Customer } from '../customers/customer.types';
import { MAILER, Mailer } from '../mail/mailer';
import type { Reminder } from '../me/me.service';
import { addDays, nextOccurrence, pkt } from '../pricing/rules';
import { JsonStore } from '../storage/json-store.service';

/** Reminders go out in the morning, Pakistan time. */
export const REMINDER_HOUR = 9;

type SavedReminder = Reminder & { lastNotifiedFor?: string };

@Injectable()
export class RemindersService {
  private readonly logger = new Logger(RemindersService.name);

  constructor(
    private readonly store: JsonStore,
    @Inject(MAILER) private readonly mailer: Mailer,
  ) {}

  /**
   * E8-1: a saved occasion repeats every year. It is emailed `notifyDaysBefore` days ahead, once per year.
   * Each reminder is marked first and sent second, so overlapping runs cannot send it twice;
   * if the email fails the mark is removed and the next run tries again.
   */
  async sendDue(now: Date): Promise<number> {
    const today = pkt(now);
    if (today.hour < REMINDER_HOUR) return 0;

    const due: { reminder: SavedReminder; occasionOn: string }[] = [];
    await this.store.mutate('reminders', (docs) => {
      due.length = 0;
      for (const r of docs as SavedReminder[]) {
        const occasionOn = nextOccurrence(r.date, today.date);
        const notifyFrom = addDays(occasionOn, -r.notifyDaysBefore);
        if (today.date >= notifyFrom && r.lastNotifiedFor !== occasionOn) {
          r.lastNotifiedFor = occasionOn;
          due.push({ reminder: structuredClone(r), occasionOn });
        }
      }
    });

    let sent = 0;
    for (const { reminder, occasionOn } of due) {
      const customer = await this.store.get<Customer>(
        'customers',
        reminder.customerId,
      );
      if (!customer || customer.isGuest) continue; // nobody to email: leave it marked so it is not retried forever
      try {
        const who = reminder.recipientName
          ? ` for ${reminder.recipientName}`
          : '';
        await this.mailer.send({
          to: customer.email,
          subject: `Coming up: ${reminder.label}`,
          text: `${reminder.label}${who} is on ${occasionOn}. Find the right gift: ${process.env.APP_URL ?? 'http://localhost:3000'}`,
        });
        sent++;
      } catch (e) {
        this.logger.warn(`Reminder ${reminder.id} not sent: ${String(e)}`);
        await this.store.mutate('reminders', (docs) => {
          const r = docs.find((d) => d.id === reminder.id) as
            SavedReminder | undefined;
          if (r && r.lastNotifiedFor === occasionOn)
            r.lastNotifiedFor = undefined;
        });
      }
    }
    return sent;
  }
}
