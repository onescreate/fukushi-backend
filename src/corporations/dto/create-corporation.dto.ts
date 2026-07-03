import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { AddressContactDto } from '../../common/dto/address-contact.dto';

export class CreateCorporationDto extends AddressContactDto {
  @IsString()
  @MinLength(1, { message: '法人名を入力してください' })
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
