import { Module } from '@nestjs/common';
import { MealPricingController } from './meal-pricing.controller';
import { MealPricingService } from './meal-pricing.service';
import { TaxSettingController } from './tax-setting.controller';
import { TaxSettingService } from './tax-setting.service';
import { MealReservationController } from './meal-reservation.controller';
import { MyMealsController } from './my-meals.controller';
import { MealReservationService } from './meal-reservation.service';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';
import { InvoiceSettingController } from './invoice-setting.controller';
import { InvoiceSettingService } from './invoice-setting.service';

@Module({
  controllers: [
    MealPricingController,
    TaxSettingController,
    MealReservationController,
    MyMealsController,
    BillingController,
    InvoiceSettingController,
  ],
  providers: [
    MealPricingService,
    TaxSettingService,
    MealReservationService,
    BillingService,
    InvoiceSettingService,
  ],
  exports: [MealPricingService, TaxSettingService, MealReservationService],
})
export class MealsModule {}
