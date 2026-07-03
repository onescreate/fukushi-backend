import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateDeviceDto {
  @IsString()
  @MinLength(1, { message: '店舗を選択してください' })
  facilityId!: string;

  @IsString()
  @MinLength(1, { message: '端末名を入力してください' })
  @MaxLength(50)
  label!: string;
}
