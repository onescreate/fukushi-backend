import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';
import { FacilitiesService } from './facilities.service';

// 店舗マスタ（store.manage）＝システム管理者・法人管理者
@RequirePermission('store.manage')
@Controller('facilities')
export class FacilitiesController {
  constructor(private readonly service: FacilitiesService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.service.list(principal);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateFacilityDto) {
    return this.service.create(principal, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateFacilityDto,
  ) {
    return this.service.update(principal, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.remove(principal, id);
  }
}
