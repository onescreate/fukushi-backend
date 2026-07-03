import { TaxCategory, TaxRounding } from '@prisma/client';
import { IsBoolean, IsEnum, IsInt, Matches, Max, Min } from 'class-validator';

/** 消費税設定（法人ごと・区分別・履歴型）の登録/更新 */
export class UpsertTaxSettingDto {
  /** 適用開始日（この日以降に適用）。YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '適用開始日はYYYY-MM-DD形式で指定してください' })
  effectiveDate!: string;

  /** 税区分（標準/軽減） */
  @IsEnum(TaxCategory)
  category!: TaxCategory;

  /** 税率（％） */
  @IsInt()
  @Min(0)
  @Max(100)
  rate!: number;

  /** 内税(true)/外税(false) */
  @IsBoolean()
  priceIncludesTax!: boolean;

  /** 端数処理 */
  @IsEnum(TaxRounding)
  rounding!: TaxRounding;
}
