import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { AttendanceService } from './attendance.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';
import { MyReasonDto } from '../schedules/dto/my-reason.dto';

// 利用者本人の実績履歴（ログイン必須・利用者のみ）
@Controller('my/attendance')
export class MyAttendanceController {
  constructor(private readonly service: AttendanceService) {}

  private asUser(principal: Principal) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('この機能は利用者専用です');
    }
    return principal;
  }

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('from', ParseYmdPipe) from: string,
    @Query('to', ParseYmdPipe) to: string,
  ) {
    const user = this.asUser(principal);
    return this.service.myHistory(user.id, from, to);
  }

  /** 差戻・理由未入力のアラート（利用者画面で表示） */
  @Get('alerts')
  alerts(@CurrentUser() principal: Principal) {
    const user = this.asUser(principal);
    return this.service.getAlerts(user.id);
  }

  /** 欠席/遅刻/早退の理由を入力 */
  @Post('reason')
  reason(@CurrentUser() principal: Principal, @Body() dto: MyReasonDto) {
    const user = this.asUser(principal);
    return this.service.submitReason(user.id, dto.date, dto.kind, dto.reason);
  }
}
