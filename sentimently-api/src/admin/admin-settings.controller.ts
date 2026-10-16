import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import { AdminSettingsService } from './admin-settings.service';
import {
  CreatePromoDto,
  CreateStaffDto,
  UpdateExtraDto,
  UpdatePromoDto,
  UpdateStoreDto,
} from './admin-settings.dto';

/**
 * Settings for the admin console. Staff can look at everything; changing prices, rates, codes and who has access is admin only.
 */
@Controller('admin')
export class AdminSettingsController {
  constructor(private readonly settings: AdminSettingsService) {}

  @Get('store')
  @Roles('staff', 'admin')
  getStore() {
    return this.settings.getStore();
  }

  @Patch('store')
  @Roles('admin')
  updateStore(@Body() dto: UpdateStoreDto) {
    return this.settings.updateStore(dto);
  }

  @Get('promo-codes')
  @Roles('staff', 'admin')
  promos() {
    return this.settings.promos();
  }

  @Post('promo-codes')
  @Roles('admin')
  createPromo(@Body() dto: CreatePromoDto) {
    return this.settings.createPromo(dto);
  }

  @Patch('promo-codes/:code')
  @Roles('admin')
  updatePromo(@Param('code') code: string, @Body() dto: UpdatePromoDto) {
    return this.settings.updatePromo(code, dto);
  }

  @Get('extras')
  @Roles('staff', 'admin')
  extras() {
    return this.settings.extras();
  }

  @Patch('extras/:code')
  @Roles('admin')
  updateExtra(@Param('code') code: string, @Body() dto: UpdateExtraDto) {
    return this.settings.updateExtra(code, dto);
  }

  @Get('staff')
  @Roles('admin')
  staff() {
    return this.settings.staff();
  }

  @Post('staff')
  @Roles('admin')
  createStaff(@Body() dto: CreateStaffDto) {
    return this.settings.createStaff(dto);
  }

  @Delete('staff/:id')
  @Roles('admin')
  @HttpCode(200)
  removeStaff(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.settings.removeStaff(id, user.id);
  }
}
