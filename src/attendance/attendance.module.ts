import { Module } from '@nestjs/common';
import { AttendanceService } from './attendance.service';
import { AttendanceSettingsController } from './attendance-settings.controller';

@Module({
  controllers: [AttendanceSettingsController],
  providers: [AttendanceService],
  exports: [AttendanceService],
})
export class AttendanceModule {}
