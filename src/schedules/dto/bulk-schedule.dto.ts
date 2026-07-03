import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class BulkScheduleDto {
  @IsString()
  userId!: string;

  @IsArray()
  @ArrayNotEmpty({ message: '日付を1つ以上指定してください' })
  @IsDateString({}, { each: true })
  dates!: string[];

  @IsOptional()
  @Matches(HHMM, { message: '開始時刻は HH:MM で入力してください' })
  planIn?: string;

  @IsOptional()
  @Matches(HHMM, { message: '終了時刻は HH:MM で入力してください' })
  planOut?: string;
}
