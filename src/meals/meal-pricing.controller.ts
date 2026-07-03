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
import { UpsertMealPricingDto } from './dto/meal-pricing.dto';
import { MealPricingService } from './meal-pricing.service';

// 食事料金マスタ（店舗ごと・履歴型）
@RequirePermission('meal.view')
@Controller('meal-pricings')
export class MealPricingController {
  constructor(private readonly service: MealPricingService) {}

  @Get(':facilityId')
  list(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
  ) {
    return this.service.list(principal, facilityId);
  }

  @RequirePermission('meal.manage')
  @Post(':facilityId')
  create(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: UpsertMealPricingDto,
  ) {
    return this.service.create(principal, facilityId, dto);
  }

  @RequirePermission('meal.manage')
  @Put(':facilityId/:id')
  update(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
    @Body() dto: UpsertMealPricingDto,
  ) {
    return this.service.update(principal, facilityId, id, dto);
  }

  @RequirePermission('meal.manage')
  @Delete(':facilityId/:id')
  remove(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Param('id') id: string,
  ) {
    return this.service.remove(principal, facilityId, id);
  }
}
