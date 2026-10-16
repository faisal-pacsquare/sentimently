import { Module } from '@nestjs/common';
import { DigitalModule } from '../digital/digital.module';
import { OrdersModule } from '../orders/orders.module';
import { PricingModule } from '../pricing/pricing.module';
import { PrivacyModule } from '../privacy/privacy.module';
import { DigitalAdminController } from './digital-admin.controller';
import { GiftLinksController } from './gift-links.controller';
import { GiftLinksService } from './gift-links.service';
import { RemindersService } from './reminders.service';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { SchedulerController } from './scheduler.controller';
import { SchedulerService } from './scheduler.service';

@Module({
  imports: [OrdersModule, DigitalModule, PricingModule, PrivacyModule],
  controllers: [
    GiftLinksController,
    SchedulerController,
    ReportsController,
    DigitalAdminController,
  ],
  providers: [
    GiftLinksService,
    RemindersService,
    SchedulerService,
    ReportsService,
  ],
})
export class FulfilmentModule {}
