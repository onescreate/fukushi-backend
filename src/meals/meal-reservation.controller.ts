import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { AdminMealDto } from './dto/admin-meal.dto';
import { MealReservationService } from './meal-reservation.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

// 食事予約（管理側）。閲覧=meal.view、操作/承認=meal.manage。
@RequirePermission('meal.view')
@Controller('meal-reservations')
export class MealReservationController {
  constructor(private readonly service: MealReservationService) {}

  @RequirePermission('meal.manage')
  @Get('pending')
  pending(@CurrentUser() principal: Principal) {
    return this.service.listPending(principal);
  }

  @RequirePermission('meal.manage')
  @Get('pending/count')
  pendingCount(@CurrentUser() principal: Principal) {
    return this.service.pendingCount(principal);
  }

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('from', ParseYmdPipe) from: string,
    @Query('to', ParseYmdPipe) to: string,
  ) {
    return this.service.list(principal, facilityId, from, to);
  }

  @RequirePermission('meal.manage')
  @Post()
  upsert(@CurrentUser() principal: Principal, @Body() dto: AdminMealDto) {
    return this.service.adminUpsert(principal, dto);
  }

  @RequirePermission('meal.manage')
  @Patch(':id/approve')
  approve(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.decide(principal, id, 'approved');
  }

  @RequirePermission('meal.manage')
  @Patch(':id/reject')
  reject(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.decide(principal, id, 'rejected');
  }
}
