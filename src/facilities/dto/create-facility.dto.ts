import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { AddressContactDto } from '../../common/dto/address-contact.dto';

export class CreateFacilityDto extends AddressContactDto {
  @IsString()
  @MinLength(1, { message: '法人を選択してください' })
  corporationId!: string;

  @IsString()
  @MinLength(1, { message: '店舗名を入力してください' })
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceType?: string;

  @IsOptional()
  @IsBoolean()
  mealsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  mealChangeDeadlineDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remarks?: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
