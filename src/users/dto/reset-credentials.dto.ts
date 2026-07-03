import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ResetPinDto {
  @Matches(/^\d{4,6}$/, { message: 'PINは4〜6桁の数字で入力してください' })
  pin!: string;
}

export class ResetUserPasswordDto {
  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上にしてください' })
  @MaxLength(72)
  password!: string;
}
