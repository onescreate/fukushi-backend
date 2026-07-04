import {
  Body,
  Controller,
  Get,
  Patch,
  ParseIntPipe,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { BillingNoteDto, BillingPaymentDto } from './dto/billing.dto';
import { BillingService } from './billing.service';

// 食事の月次請求・入金管理。閲覧=billing.view、入金/メモ=billing.payment。
@RequirePermission('billing.view')
@Controller('meal-billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.list(principal, facilityId, year, month);
  }

  @Get('detail')
  detail(
    @CurrentUser() principal: Principal,
    @Query('userId') userId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.detail(principal, userId, year, month);
  }

  @RequirePermission('billing.payment')
  @Patch('payment')
  setPayment(
    @CurrentUser() principal: Principal,
    @Body() dto: BillingPaymentDto,
  ) {
    return this.service.setPayment(
      principal,
      dto.userId,
      dto.year,
      dto.month,
      dto.paymentDate,
    );
  }

  @RequirePermission('billing.payment')
  @Patch('note')
  setNote(@CurrentUser() principal: Principal, @Body() dto: BillingNoteDto) {
    return this.service.setNote(
      principal,
      dto.userId,
      dto.year,
      dto.month,
      dto.note ?? '',
    );
  }
}
