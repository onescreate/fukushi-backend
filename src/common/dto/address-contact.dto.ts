import {
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 法人・店舗で共通の住所・連絡先フィールド（すべて任意） */
export class AddressContactDto {
  @IsOptional()
  @IsDateString({}, { message: '設立年月日の形式が正しくありません' })
  establishedOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(8)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  prefecture?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  city?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressLine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;
}
