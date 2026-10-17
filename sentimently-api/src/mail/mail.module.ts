import {
  Body,
  Controller,
  Global,
  HttpCode,
  Inject,
  Module,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, MaxLength } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { AdminNotifier } from './admin-notifier';
import { createMailer, HttpMailer, MAILER, Mailer } from './mailer';

export class TestEmailDto {
  @IsEmail() @MaxLength(254) to!: string;
}

/**
 * "Why did nothing arrive?" answered in one click. An administrator sends a test email to any address and sees
 * which service is in use and, if it was refused, the reason (for example an unverified sender).
 */
@Controller('admin/mail')
@Roles('admin')
export class MailAdminController {
  constructor(@Inject(MAILER) private readonly mailer: Mailer) {}

  @Post('test')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async test(@Body() dto: TestEmailDto) {
    const provider =
      this.mailer instanceof HttpMailer ? this.mailer.provider : 'console';
    if (provider === 'console') {
      return {
        sent: false,
        provider,
        message:
          'No email service is set up on this API, so nothing can be delivered. Add BREVO_API_KEY and MAIL_FROM (see DEPLOYMENT.md) and redeploy.',
      };
    }
    try {
      await this.mailer.send({
        to: dto.to,
        subject: 'Test email from your Bloomora shop',
        text: 'If you can read this, your shop can send email. Order confirmations, confirmation links and password resets will reach customers.',
      });
      return {
        sent: true,
        provider,
        message: `Handed to ${provider}. It should arrive within a minute; check the spam folder too.`,
      };
    } catch (e) {
      return {
        sent: false,
        provider,
        message:
          e instanceof Error
            ? e.message
            : 'The email service refused the email.',
      };
    }
  }
}

@Global()
@Module({
  controllers: [MailAdminController],
  providers: [
    { provide: MAILER, useFactory: () => createMailer() },
    AdminNotifier,
  ],
  exports: [MAILER, AdminNotifier],
})
export class MailModule {}
