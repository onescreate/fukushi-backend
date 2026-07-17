import { IsBoolean, IsEnum, IsOptional } from 'class-validator';
import { ServiceType } from '@prisma/client';

export class DesignateShopDto {
  /** サービス種別（就労移行/継続A/継続B/その他）。未指定可。 */
  @IsOptional()
  @IsEnum(ServiceType)
  serviceType?: ServiceType;

  /** 食事機能の有無 */
  @IsOptional()
  @IsBoolean()
  mealsEnabled?: boolean;
}
