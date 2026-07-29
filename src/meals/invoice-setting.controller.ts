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
import {
  UpsertInvoiceSettingDto,
  SaveInvoiceConfigDto,
} from './dto/invoice-setting.dto';
import { InvoiceSettingService } from './invoice-setting.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

// 適格請求書の発行者情報（店舗ごと・履歴型）。閲覧=billing.view、管理=billing.issue。
@RequirePermission('billing.view')
@Controller('invoice-settings')
export class InvoiceSettingController {
  constructor(private readonly service: InvoiceSettingService) {}

  @Get(':facilityId/active')
  active(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Query('date', ParseYmdPipe) date: string,
  ) {
    return this.service.active(principal, facilityId, date);
  }

  /** 請求書に使う発行者情報（ポータル法人＋振込先＋社印＋上書きを解決）。 */
  @Get(':facilityId/issuer')
  issuer(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Query('date', ParseYmdPipe) date: string,
  ) {
    return this.service.resolveIssuer(principal, facilityId, date);
  }

  /** 振込先選択用：法人に紐づくポータル口座一覧。 */
  @RequirePermission('billing.issue')
  @Get(':facilityId/accounts')
  accounts(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.corpAccounts(principal, facilityId);
  }

  /** 事業所の請求書設定（口座選択・社印・上書き）を取得。 */
  @RequirePermission('billing.issue')
  @Get(':facilityId/config')
  getConfig(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.getConfig(principal, facilityId);
  }

  /** 事業所の請求書設定を保存。 */
  @RequirePermission('billing.issue')
  @Put(':facilityId/config')
  saveConfig(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: SaveInvoiceConfigDto,
  ) {
    return this.service.saveConfig(principal, facilityId, dto);
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
