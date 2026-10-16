import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser, Public, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import { OrdersService } from './orders.service';
import { RefundsService } from './refunds.service';
import {
  CancelDto,
  CompleteReturnDto,
  DecisionDto,
  ReturnRequestDto,
} from './returns.dto';
import { ReturnsService } from './returns.service';

const limit = (envName: string, fallback: number) => ({
  default: {
    limit: () => Number(process.env[envName] ?? fallback),
    ttl: () => 60_000,
  },
});

/** Customer side, by order number + email (so guests can use it). */
@Controller('orders')
@Public()
export class CustomerReturnsController {
  constructor(
    private readonly orders: OrdersService,
    private readonly returns: ReturnsService,
  ) {}

  /** OR-01 / OR-02: free until preparation starts; never once it is in production. */
  @Post('cancel')
  @HttpCode(200)
  @Throttle(limit('TRACK_RATE_LIMIT', 10))
  cancel(@Body() dto: CancelDto) {
    return this.orders.cancelByCustomer(dto.number, dto.email, dto.reason);
  }

  /** OR-03 damaged within 48 hours with a photo, OR-04 returns within 7 days. */
  @Post('returns')
  @HttpCode(201)
  @Throttle(limit('TRACK_RATE_LIMIT', 10))
  request(@Body() dto: ReturnRequestDto) {
    return this.returns.request(dto);
  }
}

/** Staff: returns and refunds. */
@Controller('admin')
@Roles('staff', 'admin')
export class AdminReturnsController {
  constructor(
    private readonly returns: ReturnsService,
    private readonly refunds: RefundsService,
  ) {}

  @Get('returns')
  list(@Query('status') status?: string) {
    return this.returns.list(status);
  }

  @Post('returns/:id/decision')
  @HttpCode(200)
  decide(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: DecisionDto,
  ) {
    return this.returns.decide(id, user.id, dto);
  }

  @Post('returns/:id/complete')
  @HttpCode(200)
  complete(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CompleteReturnDto,
  ) {
    return this.returns.complete(id, user.id, dto);
  }

  /** The refund queue, oldest deadline first. Overdue ones are flagged. */
  @Get('refunds')
  refundQueue(@Query('status') status?: string) {
    return this.refunds.list(status);
  }

  @Post('refunds/:id/process')
  @HttpCode(200)
  process(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.returns.processRefund(id, user.id);
  }
}
