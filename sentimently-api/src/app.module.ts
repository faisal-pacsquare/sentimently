import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminModule } from './admin/admin.module';
import { AlertsModule } from './alerts/alerts.service';
import { AuthModule } from './auth/auth.module';
import { ErrorReporterModule } from './common/error-reporter';
import { CatalogueModule } from './catalogue/catalogue.module';
import { ContactModule } from './contact/contact.controller';
import { FulfilmentModule } from './fulfilment/fulfilment.module';
import { HealthController } from './health/health.controller';
import { MailModule } from './mail/mail.module';
import { MeModule } from './me/me.module';
import { MessagingModule } from './messaging/messenger';
import { OrdersModule } from './orders/orders.module';
import { PricingModule } from './pricing/pricing.module';
import { PrivacyModule } from './privacy/privacy.module';
import { ReviewsModule } from './reviews/reviews.module';
import { StorageModule } from './storage/storage.module';
import { StoreModule } from './store/store.controller';

@Module({
  imports: [
    StorageModule,
    // In-memory counters, per instance. Over the limit: 429 with Retry-After.
    ThrottlerModule.forRootAsync({
      useFactory: () => [
        {
          ttl: Number(process.env.RATE_LIMIT_TTL_SECONDS ?? 60) * 1000,
          limit: Number(process.env.RATE_LIMIT_MAX ?? 120),
        },
      ],
    }),
    MailModule,
    MessagingModule,
    ErrorReporterModule,
    AlertsModule,
    AuthModule,
    CatalogueModule,
    MeModule,
    PricingModule,
    OrdersModule,
    FulfilmentModule,
    PrivacyModule,
    StoreModule,
    AdminModule,
    ReviewsModule,
    ContactModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
