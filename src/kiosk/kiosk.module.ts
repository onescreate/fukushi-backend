import { Module } from '@nestjs/common';
import { KioskController } from './kiosk.controller';
import { KioskDevicesController } from './kiosk-devices.controller';
import { KioskService } from './kiosk.service';

@Module({
  controllers: [KioskController, KioskDevicesController],
  providers: [KioskService],
})
export class KioskModule {}
