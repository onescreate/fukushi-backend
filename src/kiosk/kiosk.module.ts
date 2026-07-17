import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { HealthRecordsModule } from '../health-records/health-records.module';
import { KioskController } from './kiosk.controller';
import { KioskDevicesController } from './kiosk-devices.controller';
import { KioskService } from './kiosk.service';

@Module({
  imports: [AttendanceModule, HealthRecordsModule],
  controllers: [KioskController, KioskDevicesController],
  providers: [KioskService],
})
export class KioskModule {}
