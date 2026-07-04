import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SetDeliveryDto } from './dto/delivery.dto';
import { DeliveryService } from './delivery.service';

// 食事の注文・納品管理。権限は meal.delivery.manage。
@RequirePermission('meal.delivery.manage')
@Controller('meal-deliveries')
export class DeliveryController {
  constructor(private readonly service: DeliveryService) {}

  @Get(':facilityId')
  monthly(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Query('year', ParseIntPipe) year: number,
    @Query('month', ParseIntPipe) month: number,
  ) {
    return this.service.monthly(principal, facilityId, year, month);
  }

  @Post(':facilityId')
  set(
    @CurrentUser() principal: Principal,
    @Param('facilityId') facilityId: string,
    @Body() dto: SetDeliveryDto,
  ) {
    return this.service.setDelivery(
      principal,
      facilityId,
      dto.date,
      dto.deliveryCount,
      dto.note ?? null,
    );
  }
}
