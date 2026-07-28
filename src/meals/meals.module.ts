import { Module } from '@nestjs/common';
import { MealPricingController } from './meal-pricing.controller';
import { MealPricingService } from './meal-pricing.service';
import { TaxSettingController } from './tax-setting.controller';
import { TaxSettingService } from './tax-setting.service';
import { MealReservationController } from './meal-reservation.controller';
import { MyMealsController } from './my-meals.controller';
import { MealReservationService } from './meal-reservation.service';
import { BillingController } from './billing.controller';
import { MyBillingController } from './my-billing.controller';
import { BillingService } from './billing.service';
import { InvoiceSettingController } from './invoice-setting.controller';
import { InvoiceSettingService } from './invoice-setting.service';
import { DeliveryController } from './delivery.controller';
import { DeliveryService } from './delivery.service';
import { StatsController } from './stats.controller';
import { StatsService } from './stats.service';
import { SchedulesModule } from '../schedules/schedules.module';
import { HealthRecordsModule } from '../health-records/health-records.module';

@Module({
  // バッジ集約(StatsService)で予定承認待ち・健康未入力の件数を各サービスから取得するため取り込む
  imports: [SchedulesModule, HealthRecordsModule],
  controllers: [
    MealPricingController,
    TaxSettingController,
    MealReservationController,
    MyMealsController,
    BillingController,
    MyBillingController,
    InvoiceSettingController,
    DeliveryController,
    StatsController,
  ],
  providers: [
    MealPricingService,
    TaxSettingService,
    MealReservationService,
    BillingService,
    InvoiceSettingService,
    DeliveryService,
    StatsService,
  ],
  exports: [MealPricingService, TaxSettingService, MealReservationService],
})
export class MealsModule {}
