import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class DesignateShopDto {
  /** サービス種別（就労移行/継続A/継続B/その他）。未指定可。 */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  serviceType?: string;

  /** 食事機能の有無 */
  @IsOptional()
  @IsBoolean()
  mealsEnabled?: boolean;
}
