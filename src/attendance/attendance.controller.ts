import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Patch,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AttendanceService } from './attendance.service';
import { ManualAttendanceDto } from './dto/manual-attendance.dto';

@RequirePermission('attendance.view')
@Controller('attendance')
export class AttendanceController {
  constructor(private readonly service: AttendanceService) {}

  /** 当日ロースター（店舗×日付） */
  @Get('roster')
  roster(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('date') date: string,
  ) {
    return this.service.roster(principal, facilityId, date);
  }

  /** 打刻データ一覧（店舗×年月） */
  @Get('list')
  list(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.monthlyList(principal, facilityId, year, month);
  }

  /** 手動補正 */
  @RequirePermission('attendance.edit')
  @Patch('manual')
  manual(@CurrentUser() principal: Principal, @Body() dto: ManualAttendanceDto) {
    return this.service.manualUpdate(principal, dto);
  }
}
