import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module';
import { KioskController } from './kiosk.controller';
import { KioskDevicesController } from './kiosk-devices.controller';
import { KioskService } from './kiosk.service';

@Module({
  imports: [AttendanceModule],
  controllers: [KioskController, KioskDevicesController],
  providers: [KioskService],
})
export class KioskModule {}
