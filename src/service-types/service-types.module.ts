import { Module } from '@nestjs/common';
import { ServiceTypesService } from './service-types.service';
import { ServiceTypesController } from './service-types.controller';

@Module({
  providers: [ServiceTypesService],
  controllers: [ServiceTypesController],
})
export class ServiceTypesModule {}
