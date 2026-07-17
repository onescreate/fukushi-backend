import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

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

export class KioskClockDto {
  @IsString()
  @MinLength(1)
  operationToken!: string;

  @IsIn(['in', 'out'])
  type!: 'in' | 'out';
}

export class KioskBoardDto {
  @IsString()
  @MinLength(1)
  operationToken!: string;
}

export class KioskMealDto {
  @IsString()
  @MinLength(1)
  operationToken!: string;

  @IsBoolean()
  eaten!: boolean;
}

export class KioskHealthDto {
  @IsString()
  @MinLength(1)
  operationToken!: string;

  @IsNumber()
  @Min(1)
  @Max(500)
  weightKg!: number;
}

export class KioskReasonDto {
  @IsString()
  @MinLength(1)
  operationToken!: string;

  @IsString()
  @MinLength(1)
  date!: string;

  @IsIn(['absence', 'late', 'early'])
  kind!: 'absence' | 'late' | 'early';

  @IsString()
  @MinLength(1, { message: '理由を入力してください' })
  reason!: string;
}
