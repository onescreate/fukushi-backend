import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class BillingPaymentDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  /** 入金日 YYYY-MM-DD。null で未入金に戻す。 */
  @ValidateIf((o) => o.paymentDate != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '入金日はYYYY-MM-DD形式で指定してください' })
  paymentDate!: string | null;
}

export class BillingIssuedDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  /** 発行日 YYYY-MM-DD。null で未発行に戻す。 */
  @ValidateIf((o) => o.issuedDate != null)
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: '発行日はYYYY-MM-DD形式で指定してください' })
  issuedDate!: string | null;
}

export class BillingCloseDto {
  @IsString()
  @MinLength(1)
  facilityId!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;
}

export class BillingNoteDto {
  @IsUUID()
  userId!: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  year!: number;

  @IsInt()
  @Min(1)
  @Max(12)
  month!: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
