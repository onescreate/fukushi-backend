import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AttendanceService } from './attendance.service';
import { UpdateAttendanceSettingsDto } from './dto/attendance-settings.dto';

@RequirePermission('attendance.view')
@Controller('attendance-settings')
export class AttendanceSettingsController {
  constructor(private readonly service: AttendanceService) {}

  @Get(':facilityId')
  get(@Param('facilityId') facilityId: string) {
    return this.service.getSettings(facilityId);
  }

  @RequirePermission('attendance.edit')
  @Put(':facilityId')
  update(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: UpdateAttendanceSettingsDto,
  ) {
    return this.service.upsertSettings(principal, facilityId, dto);
  }
}
