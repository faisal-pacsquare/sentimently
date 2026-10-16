import { Module } from '@nestjs/common';
import { PricingModule } from '../pricing/pricing.module';
import { DigitalGiftsService } from './digital-gifts.service';
import { GiftCardsController } from './gift-cards.controller';

@Module({
  imports: [PricingModule],
  controllers: [GiftCardsController],
  providers: [DigitalGiftsService],
  exports: [DigitalGiftsService],
})
export class DigitalModule {}
