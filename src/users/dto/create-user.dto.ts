import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @Matches(/^[A-Za-z0-9._-]{2,30}$/, {
    message: 'ログインIDは半角英数字・._- で2〜30文字にしてください',
  })
  loginId!: string;

  @IsString()
  @MinLength(1, { message: '姓を入力してください' })
  @MaxLength(50)
  lastName!: string;

  @IsString()
  @MinLength(1, { message: '名を入力してください' })
  @MaxLength(50)
  firstName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  kana?: string;

  @Matches(/^\d{4,6}$/, { message: 'PINは4〜6桁の数字で入力してください' })
  pin!: string;

  @IsString()
  @MinLength(8, { message: '自宅ログイン用パスワードは8文字以上にしてください' })
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1, { message: '店舗を選択してください' })
  facilityId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  certNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  specialMealFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  heightCm?: number;

  @IsOptional()
  @IsIn(['active', 'withdrawn'])
  status?: 'active' | 'withdrawn';
}
