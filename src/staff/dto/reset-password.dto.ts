import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上にしてください' })
  @MaxLength(72)
  password!: string;
}
