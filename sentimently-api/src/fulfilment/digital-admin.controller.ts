import { Controller, HttpCode, Param, Post } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { DigitalGiftsService } from '../digital/digital-gifts.service';
import { OrdersService } from '../orders/orders.service';

@Controller('admin/digital-gifts')
@Roles('staff', 'admin')
export class DigitalAdminController {
  constructor(
    private readonly digital: DigitalGiftsService,
    private readonly orders: OrdersService,
  ) {}

  /** A gift that failed 5 times is given up on. After fixing the cause (a wrong address, a mail outage), staff can send it again. */
  @Post(':id/retry')
  @HttpCode(200)
  async retry(@Param('id') id: string) {
    const result = await this.digital.retry(id, new Date());
    await this.orders.completeDigitalOrders(result.completedOrderIds);
    return result.gift;
  }
}
