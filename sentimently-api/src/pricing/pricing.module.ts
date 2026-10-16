import { Module } from '@nestjs/common';
import { PricingController } from './pricing.controller';
import { CLOCK, PricingService } from './pricing.service';

@Module({
  controllers: [PricingController],
  providers: [
    PricingService,
    { provide: CLOCK, useValue: { now: () => new Date() } },
  ],
  exports: [PricingService, CLOCK],
})
export class PricingModule {}
