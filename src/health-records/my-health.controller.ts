import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
} from '@nestjs/common';
import { IsNumber, Max, Min } from 'class-validator';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { HealthRecordsService } from './health-records.service';

class SelfWeightDto {
  @IsNumber()
  @Min(1)
  @Max(500)
  weightKg!: number;
}

// 利用者本人用。ログイン済み利用者のみ。月1回、体重を記録できる。
@Controller('my/health')
export class MyHealthController {
  constructor(private readonly service: HealthRecordsService) {}

  private asUser(principal: Principal) {
    if (principal.type !== 'user') {
      throw new ForbiddenException('利用者のみ利用できます');
    }
    return principal;
  }

  @Get()
  status(@CurrentUser() principal: Principal) {
    return this.service.selfStatus(this.asUser(principal).id);
  }

  @Post()
  submit(@CurrentUser() principal: Principal, @Body() dto: SelfWeightDto) {
    return this.service.recordSelfWeight(this.asUser(principal).id, dto.weightKg);
  }
}
