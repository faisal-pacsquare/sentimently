import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import type { AuthUser } from '../customers/customer.types';
import { PrivacyService } from './privacy.service';

export class DeleteAccountDto {
  /** Required for accounts that sign in with a password. */
  @IsOptional() @IsString() @MaxLength(128) password?: string;
}

export class EraseDto {
  @IsEmail() @MaxLength(254) email!: string;
}

@Controller()
export class PrivacyController {
  constructor(private readonly privacy: PrivacyService) {}

  /** Download everything we hold about you. */
  @Get('me/export')
  export(@CurrentUser() user: AuthUser) {
    return this.privacy.export(user.id);
  }

  /** Delete your account. Personal details on your orders are removed; amounts and dates are kept for the accounts. */
  @Delete('me')
  @HttpCode(204)
  async deleteAccount(
    @CurrentUser() user: AuthUser,
    @Body() dto: DeleteAccountDto,
  ) {
    await this.privacy.deleteMyAccount(user.id, dto.password);
  }

  /** Support: erase someone by email, including guests who never had an account. */
  @Post('admin/privacy/erase')
  @Roles('admin')
  @HttpCode(200)
  erase(@Body() dto: EraseDto) {
    return this.privacy.eraseByEmail(dto.email);
  }
}
