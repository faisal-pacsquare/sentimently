import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { AuthUser } from '../customers/customer.types';
import { CurrentUser, Public } from './auth.decorators';
import {
  ForgotDto,
  GoogleDto,
  LoginDto,
  RegisterDto,
  ResetDto,
  VerifyEmailDto,
} from './auth.dto';
import { AuthService } from './auth.service';

// Sign-in endpoints get a much lower limit than the rest of the API (guessing protection).
const authLimit = {
  default: {
    limit: () => Number(process.env.AUTH_RATE_LIMIT ?? 10),
    ttl: () => 60_000,
  },
};

@Controller('auth')
@Public()
@Throttle(authLimit)
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Creates an account and emails a confirmation link. Guest orders are never attached automatically: the customer adds one with POST /me/claim-order. */
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto);
  }

  @Post('google')
  @HttpCode(200)
  google(@Body() dto: GoogleDto) {
    return this.auth.loginWithGoogle(dto.idToken);
  }

  /** The link in the confirmation email. Proves the person controls the address. It does not move guest orders; use POST /me/claim-order for that. */
  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(202)
  async forgot(@Body() dto: ForgotDto) {
    await this.auth.forgotPassword(dto.email);
    return {
      message: 'If that email has an account, a reset link is on its way.',
    };
  }

  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body() dto: ResetDto) {
    await this.auth.resetPassword(dto.token, dto.password);
    return { message: 'Your password has been changed.' };
  }
}

/** Auth actions that need a signed-in person (no @Public). */
@Controller('auth')
@Throttle(authLimit)
export class AccountAuthController {
  constructor(private readonly auth: AuthService) {}

  /** Sends a fresh confirmation email. The earlier link stops working. */
  @Post('resend-verification')
  @HttpCode(202)
  async resend(@CurrentUser() user: AuthUser) {
    await this.auth.resendVerification(user.id);
    return {
      message: 'If your email is not confirmed yet, a new link is on its way.',
    };
  }
}
