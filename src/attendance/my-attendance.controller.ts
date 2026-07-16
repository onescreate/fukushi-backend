import {
  Controller,
  ForbiddenException,
  Get,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { AttendanceService } from './attendance.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

// 利用者本人の実績履歴（ログイン必須・利用者のみ）
@Controller('my/attendance')
export class MyAttendanceController {
  constructor(private readonly service: AttendanceService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('from', ParseYmdPipe) from: string,
    @Query('to', ParseYmdPipe) to: string,
  ) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('この機能は利用者専用です');
    }
    return this.service.myHistory(principal.id, from, to);
  }
}
