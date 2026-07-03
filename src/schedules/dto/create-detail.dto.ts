import { IsIn, IsOptional, Matches, MaxLength, IsString } from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateScheduleDetailDto {
  @IsOptional()
  @IsIn(['break_out', 'practice', 'other'])
  eventType?: 'break_out' | 'practice' | 'other';

  @IsOptional()
  @Matches(HHMM, { message: '外出時刻は HH:MM で入力してください' })
  plannedOut?: string;

  @IsOptional()
  @Matches(HHMM, { message: '戻り時刻は HH:MM で入力してください' })
  plannedIn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  note?: string;
}
