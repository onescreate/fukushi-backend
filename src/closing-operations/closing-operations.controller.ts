import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { SaveClosingOperationDto } from './dto/closing-operation.dto';
import { ClosingOperationsService } from './closing-operations.service';
import { ParseYmdPipe } from '../common/parse-ymd.pipe';

// 締め業務（実績記録・加算）。権限は closing.manage。
@RequirePermission('closing.manage')
@Controller('closing-operations')
export class ClosingOperationsController {
  constructor(private readonly service: ClosingOperationsService) {}

  @Get()
  list(
    @CurrentUser() principal: Principal,
    @Query('facilityId') facilityId: string,
    @Query('date', ParseYmdPipe) date: string,
  ) {
    return this.service.list(principal, facilityId, date);
  }

  @Post(':userId')
  save(
    @CurrentUser() principal: Principal,
    @Param('userId') userId: string,
    @Query('date', ParseYmdPipe) date: string,
    @Body() dto: SaveClosingOperationDto,
  ) {
    return this.service.save(principal, userId, date, dto);
  }
}
