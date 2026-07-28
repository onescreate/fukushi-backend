import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { MySchedulesController } from './my-schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  controllers: [SchedulesController, MySchedulesController],
  providers: [SchedulesService],
  exports: [SchedulesService], // StatsService（バッジ集約）から pendingCount を利用するため
})
export class SchedulesModule {}
