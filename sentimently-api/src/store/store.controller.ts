import {
  Controller,
  Get,
  Header,
  Inject,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { OrdersModule } from '../orders/orders.module';
import { PAYMENT_GATEWAY, PaymentGateway } from '../orders/payment-gateway';
import type { DeliveryConfig } from '../pricing/rules';
import { JsonStore } from '../storage/json-store.service';
import type { Doc } from '../storage/storage.types';

export type StoreSettings = Doc &
  DeliveryConfig & {
    announcement?: string | null;
    banner?: string | null;
    digitalFee?: number;
    contactPhone?: string | null;
    contactEmail?: string | null;
    socialLinks?: Record<string, string>;
    bankTransferInstructions?: string | null;
  };

/** The settings every page of the shop needs. Nothing private (bank details, daily capacity) is included. */
@Controller('store')
@Public()
export class StoreController {
  constructor(
    private readonly store: JsonStore,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
  async settings() {
    const c = await this.store.get<StoreSettings>('storeConfig', 'main');
    if (!c) throw new ServiceUnavailableException('Store settings are missing');
    const card =
      process.env.FEATURE_CARD_PAYMENTS === 'true' && this.gateway.available;
    return {
      announcement: c.announcement ?? null,
      banner: c.banner ?? null,
      freeDeliveryThreshold: c.freeDeliveryThreshold,
      sameDayCutoffHour: c.sameDayCutoffHour,
      deliveryRates: c.deliveryRates,
      restOfPakistan: c.restOfPakistan,
      digitalFee: c.digitalFee ?? 0,
      contact: { phone: c.contactPhone ?? null, email: c.contactEmail ?? null },
      socialLinks: c.socialLinks ?? {},
      // Which payment methods the checkout may offer right now.
      paymentMethods: ['cod', 'bank_transfer', ...(card ? ['card'] : [])],
      currency: 'PKR',
    };
  }
}

@Module({ imports: [OrdersModule], controllers: [StoreController] })
export class StoreModule {}
