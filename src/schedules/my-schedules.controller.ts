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
import {
  MySubmitScheduleDto,
  MyBulkSubmitScheduleDto,
} from './dto/my-submit-schedule.dto';
import { SchedulesService } from './schedules.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

// 利用者本人用。ログインしていれば利用可（権限は不要だが、利用者のみ）。
@Controller('my/schedules')
export class MySchedulesController {
  constructor(private readonly service: SchedulesService) {}

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
    return this.service.myList(user.id, from, to);
  }

  @Post()
  submit(
    @CurrentUser() principal: Principal,
    @Body() dto: MySubmitScheduleDto,
  ) {
    const user = this.asUser(principal);
    return this.service.mySubmit(
      {
        id: user.id,
        corporationId: user.corporationId,
        facilityId: user.facilityId,
      },
      dto,
    );
  }

  @Post('bulk')
  bulkSubmit(
    @CurrentUser() principal: Principal,
    @Body() dto: MyBulkSubmitScheduleDto,
  ) {
    const user = this.asUser(principal);
    return this.service.myBulkSubmit(
      {
        id: user.id,
        corporationId: user.corporationId,
        facilityId: user.facilityId,
      },
      dto,
    );
  }
}
