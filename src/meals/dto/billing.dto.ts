import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
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
