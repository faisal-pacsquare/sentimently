import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import {
  AdminOrderQueryDto,
  CheckoutDto,
  TrackDto,
  TransitionDto,
} from './checkout.dto';
import { OrdersService } from './orders.service';
import { PAYMENT_GATEWAY, PaymentGateway } from './payment-gateway';

const limit = (envName: string, fallback: number) => ({
  default: {
    limit: () => Number(process.env[envName] ?? fallback),
    ttl: () => 60_000,
  },
});

@Controller()
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    @Inject(PAYMENT_GATEWAY) private readonly gateway: PaymentGateway,
  ) {}

  /** Guests can check out (Q1). A token, if sent, ties the order to the account. */
  @Post('checkout')
  @Public()
  @HttpCode(201)
  @Throttle(limit('CHECKOUT_RATE_LIMIT', 20))
  checkout(
    @Body() dto: CheckoutDto,
    @CurrentUser() user?: AuthUser,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.orders.checkout(dto, user, key?.slice(0, 100));
  }

  /** POST, not GET, so the email never appears in a URL. Tight limit: this is a lookup people could guess at. */
  @Post('orders/track')
  @Public()
  @HttpCode(200)
  @Throttle(limit('TRACK_RATE_LIMIT', 10))
  track(@Body() dto: TrackDto) {
    return this.orders.track(dto.number, dto.email);
  }

  @Get('orders')
  mine(@CurrentUser() user: AuthUser) {
    return this.orders.listMine(user.id);
  }

  @Get('orders/:number')
  one(@CurrentUser() user: AuthUser, @Param('number') number: string) {
    return this.orders.getMine(user.id, number);
  }

  /** Called by the card gateway. The adapter checks the signature; a repeated event changes nothing. */
  @Post('payments/webhook')
  @Public()
  @SkipThrottle() // a burst of genuine callbacks must not be delayed; the signature check is the protection
  @HttpCode(200)
  async webhook(
    @Headers() headers: Record<string, string | string[] | undefined>,
    @Body() body: unknown,
    @Req() req: RawBodyRequest<Request>,
  ) {
    const event = await this.gateway.parseWebhook(headers, body, req.rawBody);
    // A signed callback we do not act on is still acknowledged, so the gateway stops resending it.
    return event
      ? this.orders.handleGatewayEvent(event)
      : { result: 'ignored' };
  }
}

/** Studio staff: the order queue and production board. */
@Controller('admin')
@Roles('staff', 'admin')
export class AdminOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('orders')
  list(@Query() q: AdminOrderQueryDto) {
    return this.orders.adminList(q);
  }

  @Get('orders/:id')
  one(@Param('id') id: string) {
    return this.orders.adminGet(id);
  }

  /** Moves an order along. Confirming a bank transfer is a move to "paid". */
  @Post('orders/:id/status')
  @HttpCode(200)
  async status(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: TransitionDto,
  ) {
    await this.orders.transition(id, dto.status, user.id, {
      note: dto.note,
      courier: dto.courier,
      trackingRef: dto.trackingRef,
    });
    return this.orders.adminGet(id);
  }

  @Get('production')
  production() {
    return this.orders.production();
  }
}
