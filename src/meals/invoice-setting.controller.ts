import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { UpsertInvoiceSettingDto } from './dto/invoice-setting.dto';
import { InvoiceSettingService } from './invoice-setting.service';

// 適格請求書の発行者情報（店舗ごと・履歴型）。閲覧=billing.view、管理=billing.issue。
@RequirePermission('billing.view')
@Controller('invoice-settings')
export class InvoiceSettingController {
  constructor(private readonly service: InvoiceSettingService) {}

  @Get(':facilityId/active')
  active(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Query('date') date: string,
  ) {
    return this.service.active(principal, facilityId, date);
  }

  @RequirePermission('billing.issue')
  @Get(':facilityId')
  list(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.list(principal, facilityId);
  }

  @RequirePermission('billing.issue')
  @Post(':facilityId')
  create(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: UpsertInvoiceSettingDto,
  ) {
    return this.service.create(principal, facilityId, dto);
  }

  @RequirePermission('billing.issue')
  @Put(':facilityId/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
    @Body() dto: UpsertInvoiceSettingDto,
  ) {
    return this.service.update(principal, facilityId, id, dto);
  }

  @RequirePermission('billing.issue')
  @Delete(':facilityId/:id')
  remove(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(principal, facilityId, id);
  }
}
