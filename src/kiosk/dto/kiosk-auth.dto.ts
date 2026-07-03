import { IsString, MinLength } from 'class-validator';

export class KioskUsersDto {
  @IsString()
  @MinLength(1)
  deviceToken!: string;
}

export class KioskAuthDto {
  @IsString()
  @MinLength(1)
  deviceToken!: string;

  @IsString()
  @MinLength(1)
  userId!: string;

  @IsString()
  @MinLength(1)
  pin!: string;
}
