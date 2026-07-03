import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

const ROLES = [
  'system_admin',
  'corporation_admin',
  'facility_admin',
  'staff',
] as const;

export class CreateStaffDto {
  @IsString()
  @MinLength(1, { message: '姓を入力してください' })
  @MaxLength(50)
  lastName!: string;

  @IsString()
  @MinLength(1, { message: '名を入力してください' })
  @MaxLength(50)
  firstName!: string;

  @IsEmail({}, { message: 'メールアドレスの形式が正しくありません' })
  email!: string;

  @IsString()
  @MinLength(8, { message: 'パスワードは8文字以上にしてください' })
  @MaxLength(72)
  password!: string;

  @IsString()
  @MinLength(1, { message: '法人を選択してください' })
  corporationId!: string;

  @IsIn(ROLES, { message: '権限（ロール）を選択してください' })
  role!: (typeof ROLES)[number];

  /** 店舗単位のロール（facility_admin / staff）のとき必須 */
  @IsOptional()
  @IsString()
  facilityId?: string;
}
