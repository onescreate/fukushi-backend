import { Controller, Get, ParseIntPipe, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { StatsService } from './stats.service';

// ダッシュボードの集計。
@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}

  // 集計（通所・食事・請求）は attendance.view が必要（請求は billing.view を持つ場合のみ含める）。
  @RequirePermission('attendance.view')
  @Get('facility')
  facility(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.facilitySummary(principal, facilityId, year, month);
  }

  // サイドバー等のバッジ件数。各件数を内部で権限判定するため、共通の権限要件は付けない（認証のみ）。
  @Get('badges')
  badges(@CurrentUser() principal: Principal) {
    return this.service.badges(principal);
  }
}
