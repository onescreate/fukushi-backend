import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpsertTaxSettingDto } from './dto/tax-setting.dto';
import { TaxSettingService } from './tax-setting.service';

// 消費税設定マスタ（法人ごと・区分別・履歴型）。権限は settings.tax（権限モジュールで管理）。
@RequirePermission('settings.tax')
@Controller('tax-settings')
export class TaxSettingController {
  constructor(private readonly service: TaxSettingService) {}

  @Get(':corporationId')
  list(
    @CurrentUser() principal: Principal,
    @Param('corporationId') corporationId: string,
  ) {
    return this.service.list(principal, corporationId);
  }

  @Post(':corporationId')
  create(
    @CurrentUser() principal: Principal,
    @Param('corporationId') corporationId: string,
    @Body() dto: UpsertTaxSettingDto,
  ) {
    return this.service.create(principal, corporationId, dto);
  }

  @Put(':corporationId/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('corporationId') corporationId: string,
    @Param('id') id: string,
    @Body() dto: UpsertTaxSettingDto,
  ) {
    return this.service.update(principal, corporationId, id, dto);
  }

  @Delete(':corporationId/:id')
  remove(
    @CurrentUser() principal: Principal,
    @Param('corporationId') corporationId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(principal, corporationId, id);
  }
}
