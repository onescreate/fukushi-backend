import { Module } from '@nestjs/common';
import { ClosingOperationsController } from './closing-operations.controller';
import { ClosingOperationsService } from './closing-operations.service';

@Module({
  controllers: [ClosingOperationsController],
  providers: [ClosingOperationsService],
})
export class ClosingOperationsModule {}
