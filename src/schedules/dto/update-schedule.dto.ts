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
}
