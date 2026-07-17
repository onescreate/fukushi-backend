import { IsDateString, IsIn, IsString, MinLength } from 'class-validator';

/** 利用者本人が欠席/遅刻/早退の理由を入力するときの入力 */
export class MyReasonDto {
  @IsDateString({}, { message: '日付の形式が正しくありません' })
  date!: string;

  @IsIn(['absence', 'late', 'early'])
  kind!: 'absence' | 'late' | 'early';

  @IsString()
  @MinLength(1, { message: '理由を入力してください' })
  reason!: string;
}
