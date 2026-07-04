import { IsInt, Matches, Min } from 'class-validator';

/** 食事料金（店舗ごと・履歴型）の登録/更新 */
export class UpsertMealPricingDto {
  /** 適用開始日（この日以降に適用）。YYYY-MM-DD */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '適用開始日はYYYY-MM-DD形式で指定してください' })
  effectiveDate!: string;

  /** 通常の食事料金（内税・円） */
  @IsInt()
  @Min(0)
  mealFee!: number;

  /** 特別食事料金（補助なし等・内税・円） */
  @IsInt()
  @Min(0)
  specialMealFee!: number;

  /** キャンセル料（内税・円） */
  @IsInt()
  @Min(0)
  cancelFee!: number;
}
