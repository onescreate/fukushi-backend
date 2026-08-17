import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** 1件の承認/却下（却下のときだけ理由を受け取る） */
export class DecideScheduleDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}

/** まとめて承認/却下 */
export class BulkDecideScheduleDto {
  @IsArray()
  @ArrayNotEmpty({ message: '予定を1つ以上選んでください' })
  @ArrayMaxSize(200, { message: '一度に処理できるのは最大200件です' })
  @IsString({ each: true })
  ids!: string[];

  @IsIn(['approve', 'reject'], { message: '承認か却下かを指定してください' })
  decision!: 'approve' | 'reject';

  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
