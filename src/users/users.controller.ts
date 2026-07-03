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
import { CreateUserDto } from './dto/create-user.dto';
import {
  ResetPinDto,
  ResetUserPasswordDto,
} from './dto/reset-credentials.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

// 利用者マスタ。閲覧は user.view、更新系は user.manage。
@RequirePermission('user.view')
@Controller('users')
export class UsersController {
  constructor(private readonly service: UsersService) {}

  @Get()
  list(@CurrentUser() principal: Principal) {
    return this.service.list(principal);
  }

  @Get('facility-options')
  facilityOptions(@CurrentUser() principal: Principal) {
    return this.service.facilityOptions(principal);
  }

  @RequirePermission('user.manage')
  @Post()
  create(@CurrentUser() principal: Principal, @Body() dto: CreateUserDto) {
    return this.service.create(principal, dto);
  }

  @RequirePermission('user.manage')
  @Patch(':id')
  update(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.update(principal, id, dto);
  }

  @RequirePermission('user.manage')
  @Post(':id/reset-pin')
  resetPin(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: ResetPinDto,
  ) {
    return this.service.resetPin(principal, id, dto.pin);
  }

  @RequirePermission('user.manage')
  @Post(':id/reset-password')
  resetPassword(
    @CurrentUser() principal: Principal,
    @Param('id') id: string,
    @Body() dto: ResetUserPasswordDto,
  ) {
    return this.service.resetPassword(principal, id, dto.password);
  }

  @RequirePermission('user.manage')
  @Delete(':id')
  remove(@CurrentUser() principal: Principal, @Param('id') id: string) {
    return this.service.remove(principal, id);
  }
}
