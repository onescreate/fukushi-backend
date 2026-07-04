import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';

export class SetDeliveryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '日付はYYYY-MM-DD形式で指定してください' })
  date!: string;

  @IsInt()
  @Min(0)
  deliveryCount!: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}
