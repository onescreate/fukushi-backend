import { Module } from '@nestjs/common';
import { MealPricingController } from './meal-pricing.controller';
import { MealPricingService } from './meal-pricing.service';

@Module({
  controllers: [MealPricingController],
  providers: [MealPricingService],
  exports: [MealPricingService],
})
export class MealsModule {}
