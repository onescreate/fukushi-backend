import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { RequirePermission } from '../auth/require-permission.decorator';
import { ServiceTypesService } from './service-types.service';

class CreateServiceTypeDto {
  @IsString()
  @MinLength(1, { message: '名称を入力してください' })
  @MaxLength(50)
  name!: string;
}

class UpdateServiceTypeDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  name?: string;

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}

@RequirePermission('store.manage')
@Controller('service-types')
export class ServiceTypesController {
  constructor(private readonly service: ServiceTypesService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  create(@Body() dto: CreateServiceTypeDto) {
    return this.service.create(dto.name);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateServiceTypeDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
