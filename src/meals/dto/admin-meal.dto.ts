import { MealStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

/** 管理側の食事予約操作（override） */
export class AdminMealDto {
  @IsUUID()
  userId!: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日付はYYYY-MM-DD形式で指定してください' })
  date!: string;

  @IsEnum(MealStatus)
  status!: MealStatus;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  situation?: string;
}
