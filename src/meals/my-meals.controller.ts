import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { MySubmitMealDto } from './dto/my-submit-meal.dto';
import { MealReservationService } from './meal-reservation.service';

// 利用者本人用。ログイン済み利用者のみ。
@Controller('my/meals')
export class MyMealsController {
  constructor(private readonly service: MealReservationService) {}

  private asUser(principal: Principal) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('この機能は利用者専用です');
    }
    return principal;
  }

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    const user = this.asUser(principal);
    return this.service.myList(user.id, from, to);
  }

  @Post()
  submit(@CurrentUser() principal: Principal, @Body() dto: MySubmitMealDto) {
    const user = this.asUser(principal);
    return this.service.mySubmit(
      {
        id: user.id,
        corporationId: user.corporationId,
        facilityId: user.facilityId,
      },
      dto,
    );
  }
}
