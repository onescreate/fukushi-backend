import { IsInt, Max, Min } from 'class-validator';

export class UpdateAttendanceSettingsDto {
  @IsInt()
  @Min(0)
  @Max(240)
  lateGraceMinutes!: number;

  @IsInt()
  @Min(0)
  @Max(240)
  earlyLeaveGraceMinutes!: number;
}
