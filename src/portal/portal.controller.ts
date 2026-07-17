import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator';
import { PortalService } from './portal.service';

/** ポータル連携の確認用（管理者のみ）。接続と読み取りが通るかを検証する。 */
@RequirePermission('corporation.manage')
@Controller('portal')
export class PortalController {
  constructor(private readonly portal: PortalService) {}

  @Get('masters')
  async masters() {
    if (!this.portal.enabled) {
      return { enabled: false, message: 'PORTAL_DATABASE_URL 未設定' };
    }
    const [corps, shops, staffs] = await Promise.all([
      this.portal.getCorps(),
      this.portal.getShops(),
      this.portal.getStaffs(),
    ]);
    return {
      enabled: true,
      counts: { corps: corps.length, shops: shops.length, staffs: staffs.length },
      corps,
      shops,
      staffs,
    };
  }
}
