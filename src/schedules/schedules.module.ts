import { Module } from '@nestjs/common';
import { SchedulesController } from './schedules.controller';
import { MySchedulesController } from './my-schedules.controller';
import { SchedulesService } from './schedules.service';

@Module({
  controllers: [SchedulesController, MySchedulesController],
  providers: [SchedulesService],
})
export class SchedulesModule {}
