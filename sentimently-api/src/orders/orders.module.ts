import { Module } from '@nestjs/common';
import { DigitalModule } from '../digital/digital.module';
import { PricingModule } from '../pricing/pricing.module';
import { AdminOrdersController, OrdersController } from './orders.controller';
import { RefundsService } from './refunds.service';
import {
  AdminReturnsController,
  CustomerReturnsController,
} from './returns.controller';
import { ReturnsService } from './returns.service';
import { OrdersService } from './orders.service';
import { NullGateway, PAYMENT_GATEWAY } from './payment-gateway';
import { SafepayGateway } from './safepay.gateway';

@Module({
  imports: [PricingModule, DigitalModule],
  controllers: [
    OrdersController,
    AdminOrdersController,
    CustomerReturnsController,
    AdminReturnsController,
  ],
  providers: [
    OrdersService,
    RefundsService,
    ReturnsService,
    {
      provide: PAYMENT_GATEWAY,
      // Safepay when its keys are set; otherwise card payments are simply not offered.
      useFactory: () => SafepayGateway.fromEnv() ?? new NullGateway(),
    },
  ],
  exports: [OrdersService, RefundsService, PAYMENT_GATEWAY],
})
export class OrdersModule {}
