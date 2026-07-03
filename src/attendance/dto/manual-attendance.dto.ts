import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** 管理側の打刻手動補正 */
export class ManualAttendanceDto {
  @IsString()
  userId!: string;

  @IsString()
  date!: string; // YYYY-MM-DD

  @IsOptional()
  @IsIn(['present', 'absent'])
  status?: 'present' | 'absent';

  @IsOptional()
  @Matches(HHMM, { message: '通所時刻は HH:MM で入力してください' })
  clockIn?: string;

  @IsOptional()
  @Matches(HHMM, { message: '退所時刻は HH:MM で入力してください' })
  clockOut?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  absenceReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  lateReason?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  earlyLeaveReason?: string;
}
