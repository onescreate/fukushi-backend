import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpsertHealthRecordDto } from './dto/health-record.dto';
import { HealthRecordsService } from './health-records.service';

// 健康記録（体重・BMI）。閲覧=health.view、入力=health.edit。
@RequirePermission('health.view')
@Controller('health-records')
export class HealthRecordsController {
  constructor(private readonly service: HealthRecordsService) {}

  @Get('missing-count')
  missingCount(@CurrentUser() principal: Principal) {
    return this.service.missingCount(principal);
  }

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.list(principal, facilityId, year, month);
  }

  @RequirePermission('health.edit')
  @Post(':userId')
  upsert(
    @CurrentUser() principal: Principal,
    @Param('userId') userId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
    @Body() dto: UpsertHealthRecordDto,
  ) {
    return this.service.upsert(principal, userId, year, month, dto);
  }
}
