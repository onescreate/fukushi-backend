import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { BulkScheduleDto } from './dto/bulk-schedule.dto';
import { CreateScheduleDetailDto } from './dto/create-detail.dto';
import {
  BulkDecideScheduleDto,
  DecideScheduleDto,
} from './dto/decide-schedule.dto';
import { SchedulesService } from './schedules.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

@RequirePermission('schedule.view')
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('userId') userId: string,
    @Query('from', ParseYmdPipe) from: string,
    @Query('to', ParseYmdPipe) to: string,
  ) {
    return this.service.list(principal, userId, from, to);
  }

  @RequirePermission('schedule.approve')
  @Get('pending')
  pending(@CurrentUser() principal: Principal) {
    return this.service.listPending(principal);
  }

  @RequirePermission('schedule.approve')
  @Get('pending/count')
  pendingCount(@CurrentUser() principal: Principal) {
    return this.service.pendingCount(principal);
  }

  /** まとめて承認/却下（:id より前に置く。'decide' が :id と解釈されないようにするため） */
  @RequirePermission('schedule.approve')
  @Patch('decide')
  bulkDecide(
    @CurrentUser() principal: Principal,
    @Body() dto: BulkDecideScheduleDto,
  ) {
    return this.service.bulkDecide(
      principal,
      dto.ids,
      dto.decision === 'approve' ? 'approved' : 'rejected',
      dto.reason,
    );
  }

  @RequirePermission('schedule.approve')
  @Patch(':id/approve')
  approve(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.decide(principal, id, 'approved');
  }

  @RequirePermission('schedule.approve')
  @Patch(':id/reject')
  reject(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: DecideScheduleDto,
  ) {
    return this.service.decide(principal, id, 'rejected', dto?.reason);
  }

  @RequirePermission('schedule.submit')
  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateScheduleDto) {
    return this.service.create(principal, dto);
  }

  @RequirePermission('schedule.submit')
  @Post('bulk')
  bulk(@CurrentUser() principal: Principal, @Body() dto: BulkScheduleDto) {
    return this.service.bulkCreate(principal, dto);
  }

  @RequirePermission('schedule.submit')
  @Patch(':id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateScheduleDto,
  ) {
    return this.service.update(principal, id, dto);
  }

  @RequirePermission('schedule.submit')
  @Delete(':id')
  remove(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.remove(principal, id);
  }

  // 中抜け等（明細）
  @RequirePermission('schedule.submit')
  @Post(':id/details')
  addDetail(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: CreateScheduleDetailDto,
  ) {
    return this.service.addDetail(principal, id, dto);
  }

  @RequirePermission('schedule.submit')
  @Delete('details/:detailId')
  removeDetail(
    @CurrentUser() principal: Principal,
    @Param('detailId') detailId: string,
  ) {
    return this.service.removeDetail(principal, detailId);
  }
}
