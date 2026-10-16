import { Injectable, Logger } from '@nestjs/common';
import { AlertsService } from '../alerts/alerts.service';
import { DigitalGiftsService } from '../digital/digital-gifts.service';
import { OrdersService } from '../orders/orders.service';
import { RefundsService } from '../orders/refunds.service';
import { PrivacyService } from '../privacy/privacy.service';
import { GiftLinksService } from './gift-links.service';
import { RemindersService } from './reminders.service';

export interface SchedulerResult {
  at: string;
  digitalSent: number;
  digitalRetrying: number;
  digitalFailed: number;
  remindersSent: number;
  giftLinksExpired: number;
  refundsOverdue: number;
  /** Finished orders whose personal details were removed under the retention period. */
  ordersAnonymised: number;
  /** Names of the jobs that threw. The others still ran. */
  errors: string[];
}

/**
 * Everything that has to happen "at a set time". On Vercel there is no background worker, so a cron job
 * calls the endpoint every minute and this runs whatever is due. Every job is safe to run twice at once.
 */
@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private readonly digital: DigitalGiftsService,
    private readonly orders: OrdersService,
    private readonly reminders: RemindersService,
    private readonly links: GiftLinksService,
    private readonly refunds: RefundsService,
    private readonly alerts: AlertsService,
    private readonly privacy: PrivacyService,
  ) {}

  async run(now: Date): Promise<SchedulerResult> {
    const result: SchedulerResult = {
      at: now.toISOString(),
      digitalSent: 0,
      digitalRetrying: 0,
      digitalFailed: 0,
      remindersSent: 0,
      giftLinksExpired: 0,
      refundsOverdue: 0,
      ordersAnonymised: 0,
      errors: [],
    };

    // A failing job is reported, and never stops the ones after it.
    await this.step('digital gifts', result, async () => {
      const r = await this.digital.sendDue(now);
      result.digitalSent = r.sent;
      result.digitalRetrying = r.retrying;
      result.digitalFailed = r.failed;
      await this.orders.completeDigitalOrders(r.completedOrderIds);
    });
    await this.step('reminders', result, async () => {
      result.remindersSent = await this.reminders.sendDue(now);
    });
    await this.step('gift links', result, async () => {
      result.giftLinksExpired = await this.links.notifyExpired();
    });
    await this.step('overdue refunds', result, async () => {
      const overdue = await this.refunds.claimOverdue();
      result.refundsOverdue = overdue.length;
      for (const r of overdue) {
        await this.alerts.raise(
          'A refund is overdue',
          `Refund of Rs ${r.amount} for order ${r.orderNumber} was due by ${r.dueBy} and is still pending.`,
        );
      }
    });
    await this.step('retention', result, async () => {
      result.ordersAnonymised = await this.privacy.anonymiseOld(now);
    });
    return result;
  }

  private async step(
    name: string,
    result: SchedulerResult,
    job: () => Promise<void>,
  ) {
    try {
      await job();
    } catch (e) {
      result.errors.push(name);
      this.logger.error(`Scheduled job "${name}" failed: ${String(e)}`);
      await this.alerts.raise(`Scheduled job failed: ${name}`, String(e));
    }
  }
}
