import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PortalLinkService } from './portal-link.service';
import { DesignateShopDto } from './dto/designate-shop.dto';

/** ポータル店舗を福祉事業所として指定・解除（店舗管理権限）。 */
@RequirePermission('store.manage')
@Controller('portal/shops')
export class PortalLinkController {
  constructor(private readonly service: PortalLinkService) {}

  @Get()
  list() {
    return this.service.listShops();
  }

  @Post(':shopId/designate')
  designate(@Param('shopId') shopId: string, @Body() dto: DesignateShopDto) {
    return this.service.designate(shopId, dto);
  }

  @Delete(':shopId/designate')
  undesignate(@Param('shopId') shopId: string) {
    return this.service.undesignate(shopId);
  }
}
