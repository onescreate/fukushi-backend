import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AddressContactDto } from '../../common/dto/address-contact.dto';

const SERVICE_TYPES = [
  'transition',
  'continuous_a',
  'continuous_b',
  'other',
] as const;

export class CreateFacilityDto extends AddressContactDto {
  @IsString()
  @MinLength(1, { message: '法人を選択してください' })
  corporationId!: string;

  @IsString()
  @MinLength(1, { message: '店舗名を入力してください' })
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(SERVICE_TYPES)
  serviceType?: (typeof SERVICE_TYPES)[number];

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
