import { Body, Controller, Get, Header, HttpCode, Post } from '@nestjs/common';
import { CurrentUser, Public } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import { QuoteDto } from './quote.dto';
import { PricingService } from './pricing.service';

@Controller()
@Public()
export class PricingController {
  constructor(private readonly pricing: PricingService) {}

  /** Choices for the personalisation studio (relationships, card designs, extras, message limit, starter lines). */
  @Get('personalisation/options')
  @Header('Cache-Control', 'public, max-age=300')
  options() {
    return this.pricing.options();
  }

  /**
   * Prices the gift box. Public so guests can shop; a signed-in customer's token (if sent) is used
   * for first-gift codes. The checkout in B4 prices again before it takes payment.
   */
  @Post('quote')
  @HttpCode(200)
  quote(@Body() dto: QuoteDto, @CurrentUser() user?: AuthUser) {
    return this.pricing.quote(dto, user);
  }
}
