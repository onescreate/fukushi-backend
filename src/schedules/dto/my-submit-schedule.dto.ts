import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 中抜け（外出→戻り）の1件 */
export class MyBreakDto {
  @IsOptional()
  @Matches(HHMM, { message: '外出時刻は HH:MM で入力してください' })
  plannedOut?: string;

  @IsOptional()
  @Matches(HHMM, { message: '戻り時刻は HH:MM で入力してください' })
  plannedIn?: string;
}

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

  /** 中抜け（任意・複数可） */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MyBreakDto)
  breaks?: MyBreakDto[];
}
