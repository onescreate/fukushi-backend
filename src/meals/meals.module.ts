import { Module } from '@nestjs/common';
import { MealPricingController } from './meal-pricing.controller';
import { MealPricingService } from './meal-pricing.service';
import { TaxSettingController } from './tax-setting.controller';
import { TaxSettingService } from './tax-setting.service';

@Module({
  controllers: [MealPricingController, TaxSettingController],
  providers: [MealPricingService, TaxSettingService],
  exports: [MealPricingService, TaxSettingService],
})
export class MealsModule {}
