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
import { SchedulesService } from './schedules.service';

@RequirePermission('schedule.view')
@Controller('schedules')
export class SchedulesController {
  constructor(private readonly service: SchedulesService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('userId') userId: string,
    @Query('from') from: string,
    @Query('to') to: string,
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

  @RequirePermission('schedule.approve')
  @Patch(':id/approve')
  approve(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.decide(principal, id, 'approved');
  }

  @RequirePermission('schedule.approve')
  @Patch(':id/reject')
  reject(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.decide(principal, id, 'rejected');
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
}
