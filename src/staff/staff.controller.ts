import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { CurrentUser } from '../auth/current-user.decorator';
import { Principal } from '../auth/principal.types';
import { RequirePermission } from '../auth/require-permission.decorator';
import { CreateStaffDto } from './dto/create-staff.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { StaffService } from './staff.service';

// 職員マスタ（staff.manage）
@RequirePermission('staff.manage')
@Controller('staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.service.list(principal);
  }

  /** フォーム用の店舗選択肢（スコープ内） */
  @Get('facility-options')
  facilityOptions(@CurrentUser() principal: Principal) {
    return this.service.facilityOptions(principal);
  }

  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateStaffDto) {
    return this.service.create(principal, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateStaffDto,
  ) {
    return this.service.update(principal, id, dto);
  }

  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
  ) {
    return this.service.resetPassword(principal, id, dto.password);
  }

  @Delete(':id')
  remove(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.remove(principal, id);
  }
}
