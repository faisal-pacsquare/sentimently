import { Body, Controller, HttpCode, Inject, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength } from 'class-validator';
import { Public } from '../auth/auth.decorators';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { DigitalGiftsService } from './digital-gifts.service';

export class CheckCodeDto {
  @IsString() @MaxLength(40) code!: string;
}

@Controller('gift-cards')
@Public()
export class GiftCardsController {
  constructor(
    private readonly gifts: DigitalGiftsService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /** Tight limit: this answers "is this code real?", so guessing must be expensive. */
  @Post('check')
  @HttpCode(200)
  @Throttle({
    default: {
      limit: () => Number(process.env.CODE_CHECK_RATE_LIMIT ?? 10),
      ttl: () => 60_000,
    },
  })
  check(@Body() dto: CheckCodeDto) {
    return this.gifts.check(dto.code, this.clock.now());
  }
}
