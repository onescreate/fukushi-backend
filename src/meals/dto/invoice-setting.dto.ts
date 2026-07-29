import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

/** 適格請求書の発行者情報（店舗ごと・履歴型）の登録/更新 */
export class UpsertInvoiceSettingDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '適用開始日はYYYY-MM-DD形式で指定してください' })
  effectiveDate!: string;

  @IsString()
  @MinLength(1, { message: '発行者名を入力してください' })
  @MaxLength(100)
  issuerName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCode?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bankInfo?: string;
}

/** 事業所ごとの請求書設定（口座選択・社印・任意の上書き）。 */
export class SaveInvoiceConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bankAccountId?: string | null;

  @IsOptional()
  @IsBoolean()
  sealEnabled?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  issuerNameOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  registrationNumberOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  postalCodeOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  addressOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  phoneOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  bankInfoOverride?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  remark?: string;
}
