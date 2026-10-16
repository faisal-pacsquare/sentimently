import { Controller, Get, Query } from '@nestjs/common';
import { Roles } from '../auth/auth.decorators';
import { ReportsService } from './reports.service';

@Controller('admin')
@Roles('staff', 'admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  /** E8-4: ?from=2026-11-01&to=2026-11-30 (both optional). */
  @Get('reports/summary')
  summary(@Query('from') from?: string, @Query('to') to?: string) {
    return this.reports.summary(from, to);
  }

  /** The dispatch rota. Defaults to today in Pakistan. */
  @Get('dispatch')
  rota(@Query('date') date?: string, @Query('city') city?: string) {
    return this.reports.rota(date, city);
  }
}
