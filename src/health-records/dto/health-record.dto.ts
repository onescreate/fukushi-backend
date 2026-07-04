import {
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpsertHealthRecordDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(500)
  weightKg?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(300)
  heightCm?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '測定日はYYYY-MM-DD形式で指定してください' })
  measuredOn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
