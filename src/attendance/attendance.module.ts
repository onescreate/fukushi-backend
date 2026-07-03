import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceController } from './attendance.controller';
import { AttendanceSettingsController } from './attendance-settings.controller';

@Module({
  controllers: [AttendanceController, AttendanceSettingsController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
