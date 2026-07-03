import { ArrayNotEmpty, IsArray, IsIn, Matches } from 'class-validator';

/** 利用者本人の食事予約/取消（複数日一括） */
export class MySubmitMealDto {
  @IsArray()
  @ArrayNotEmpty()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { each: true, message: '日付はYYYY-MM-DD形式で指定してください' })
  dates!: string[];

  @IsIn(['reserve', 'cancel'])
  action!: 'reserve' | 'cancel';
}
