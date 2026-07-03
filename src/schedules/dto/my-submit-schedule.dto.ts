import {
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 利用者本人が自分の予定を申請するときの入力 */
export class MySubmitScheduleDto {
  @IsDateString({}, { message: '日付の形式が正しくありません' })
  planDate!: string;

  @IsOptional()
  @Matches(HHMM, { message: '開始時刻は HH:MM で入力してください' })
  planIn?: string;

  @IsOptional()
  @Matches(HHMM, { message: '終了時刻は HH:MM で入力してください' })
  planOut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
