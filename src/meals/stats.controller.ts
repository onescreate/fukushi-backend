import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { StatsService } from './stats.service';

// ダッシュボードの集計。閲覧は attendance.view（請求は billing.view を持つ場合のみ含める）。
@RequirePermission('attendance.view')
@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  @Get('facility')
  facility(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.facilitySummary(principal, facilityId, year, month);
  }
}
