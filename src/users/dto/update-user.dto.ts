import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  lastName?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  firstName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kana?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  facilityId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  certNumber?: string;

  @IsOptional()
  @IsBoolean()
  useSpecialMealFee?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsIn(['active', 'withdrawn'])
  status?: 'active' | 'withdrawn';
}
