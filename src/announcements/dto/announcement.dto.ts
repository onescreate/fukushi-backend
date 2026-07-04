import { AnnouncementAudience } from '@prisma/client';
import { IsEnum, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class UpsertAnnouncementDto {
  @IsString()
  @MinLength(1, { message: 'タイトルを入力してください' })
  @MaxLength(100)
  title!: string;

  @IsString()
  @MinLength(1, { message: '本文を入力してください' })
  @MaxLength(2000)
  body!: string;

  @IsEnum(AnnouncementAudience)
  audience!: AnnouncementAudience;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '掲載日はYYYY-MM-DD形式で指定してください' })
  publishedOn!: string;
}
