import {
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Post,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public, Roles } from '../auth/auth.decorators';
import { CLOCK, Clock } from '../pricing/pricing.service';
import { SchedulerService } from './scheduler.service';

const digest = (v: string) => createHash('sha256').update(v).digest();

@Controller()
@SkipThrottle()
export class SchedulerController {
  constructor(
    private readonly scheduler: SchedulerService,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Called every minute by Vercel Cron (or any pinger). Vercel sends "Authorization: Bearer <CRON_SECRET>"
   * automatically when the CRON_SECRET environment variable is set. With no secret the endpoint stays off.
   */
  @Get('internal/scheduler/run')
  @Public()
  run(@Headers('authorization') authorization?: string) {
    const secret = process.env.CRON_SECRET;
    if (!secret)
      throw new ServiceUnavailableException('The scheduler is not configured');
    const given = digest(authorization ?? '');
    const expected = digest(`Bearer ${secret}`);
    if (!timingSafeEqual(given, expected))
      throw new UnauthorizedException('Not allowed');
    return this.scheduler.run(this.clock.now());
  }

  /** Lets an admin run the due jobs by hand, for example while testing or if the cron job is down. */
  @Post('admin/scheduler/run')
  @Roles('admin')
  @HttpCode(200)
  runNow() {
    return this.scheduler.run(this.clock.now());
  }
}
