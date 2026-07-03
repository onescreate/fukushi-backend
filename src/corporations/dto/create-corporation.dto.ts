import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCorporationDto {
  @IsString()
  @MinLength(1, { message: '法人名を入力してください' })
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsIn(['active', 'inactive'])
  status?: 'active' | 'inactive';
}
