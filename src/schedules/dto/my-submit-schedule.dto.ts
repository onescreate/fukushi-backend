import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
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

  // 用件（例「通院：精神科」「ハローワーク：失業認定日」「その他：〇〇」）。任意。
  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string;
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

  /** 実習先（指定時はその日を「実習」として扱い、中抜けは登録しない）。未指定=通所。 */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  practicePlace?: string;

  /** 中抜け（任意・複数可。通所日のみ有効） */
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MyBreakDto)
  breaks?: MyBreakDto[];
}

/** 予定の一括申請（複数日にまとめて同じ通所時間を登録する）。中抜けは対象外（各日の既存はそのまま）。 */
export class MyBulkSubmitScheduleDto {
  @IsArray()
  @ArrayMaxSize(62, { message: '一度に登録できるのは最大62日です' })
  @IsDateString({}, { each: true, message: '日付の形式が正しくありません' })
  dates!: string[];

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
