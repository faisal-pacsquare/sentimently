import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import {
  ClaimOrderDto,
  CreateReminderDto,
  UpdateProfileDto,
  UpdateReminderDto,
} from './me.dto';
import { MeService } from './me.service';

/** Everything here belongs to the signed-in customer. */
@Controller('me')
export class MeController {
  constructor(private readonly me: MeService) {}

  @Get()
  profile(@CurrentUser() u: AuthUser) {
    return this.me.profile(u.id);
  }

  @Patch()
  update(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
    return this.me.updateProfile(u.id, dto);
  }

  /** Add an order you placed as a guest to your account (order number + the email it was placed with). */
  @Post('claim-order')
  @HttpCode(200)
  @Throttle({
    default: {
      limit: () => Number(process.env.TRACK_RATE_LIMIT ?? 10),
      ttl: () => 60_000,
    },
  })
  claimOrder(@CurrentUser() u: AuthUser, @Body() dto: ClaimOrderDto) {
    return this.me.claimOrder(u.id, dto.number, dto.email);
  }

  @Get('wishlist')
  wishlist(@CurrentUser() u: AuthUser) {
    return this.me.wishlist(u.id);
  }

  @Put('wishlist/:productId')
  @HttpCode(204)
  add(@CurrentUser() u: AuthUser, @Param('productId') productId: string) {
    return this.me.addToWishlist(u.id, productId);
  }

  @Delete('wishlist/:productId')
  @HttpCode(204)
  remove(@CurrentUser() u: AuthUser, @Param('productId') productId: string) {
    return this.me.removeFromWishlist(u.id, productId);
  }

  @Get('reminders')
  reminders(@CurrentUser() u: AuthUser) {
    return this.me.reminders(u.id);
  }

  @Post('reminders')
  createReminder(@CurrentUser() u: AuthUser, @Body() dto: CreateReminderDto) {
    return this.me.createReminder(u.id, dto);
  }

  @Patch('reminders/:id')
  updateReminder(
    @CurrentUser() u: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateReminderDto,
  ) {
    return this.me.updateReminder(u.id, id, dto);
  }

  @Delete('reminders/:id')
  @HttpCode(204)
  deleteReminder(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.me.deleteReminder(u.id, id);
  }
}
