import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class UpdateScheduleDto {
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

  /**
   * 実習先。値があればその日を「実習」として扱う（中抜けは持たない）。
   * 空文字なら実習を解除、未指定なら実習の状態を変更しない。
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  practicePlace?: string;
}
