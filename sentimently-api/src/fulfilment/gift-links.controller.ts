import { Body, Controller, Get, HttpCode, Param, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Public } from '../auth/auth.decorators';
import { GiftLinksService } from './gift-links.service';

export class ClaimDto {
  @IsString() @MinLength(10) @MaxLength(300) address!: string;
  @IsString() @MinLength(7) @MaxLength(30) phone!: string;
  @IsOptional() @IsString() @MaxLength(100) name?: string;
}

/** The recipient's side of a private gift link. No sign-in: the long random link is the key. */
@Controller('gift-links')
@Public()
@Throttle({
  default: {
    limit: () => Number(process.env.GIFT_LINK_RATE_LIMIT ?? 20),
    ttl: () => 60_000,
  },
})
export class GiftLinksController {
  constructor(private readonly links: GiftLinksService) {}

  @Get(':token')
  preview(@Param('token') token: string) {
    return this.links.preview(token);
  }

  @Post(':token/claim')
  @HttpCode(200)
  claim(@Param('token') token: string, @Body() dto: ClaimDto) {
    return this.links.claim(token, dto);
  }
}
