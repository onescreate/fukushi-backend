import { Module } from '@nestjs/common';
import { HealthRecordsController } from './health-records.controller';
import { MyHealthController } from './my-health.controller';
import { HealthRecordsService } from './health-records.service';

@Module({
  controllers: [HealthRecordsController, MyHealthController],
  providers: [HealthRecordsService],
  exports: [HealthRecordsService],
})
export class HealthRecordsModule {}
