import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateDeviceDto } from './dto/create-device.dto';
import { KioskService } from './kiosk.service';

// タブレット端末の管理（store.manage）
@RequirePermission('store.manage')
@Controller('kiosk-devices')
export class KioskDevicesController {
  constructor(private readonly service: KioskService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.service.listDevices(principal);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateDeviceDto) {
    return this.service.createDevice(principal, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.removeDevice(principal, id);
  }
}
