import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { getPermissionsForPrincipal } from './permissions';
import { Principal } from './principal.types';
import { PrismaService } from '../prisma/prisma.service';

@Controller()
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * GET /me — ログイン中の本人情報＋解決済みの権限一覧を返す。
   * 認証は全体適用の AuthGuard が行う（principal解決済み）。
   * 利用者には所属店舗の食事提供フラグ(mealsEnabled)も付与する。
   */
  @Get('me')
  async me(@CurrentUser() principal: Principal) {
    let mealsEnabled = false;
    if (principal.type === 'user') {
      const f = await this.prisma.facility.findUnique({
        where: { id: principal.facilityId },
        select: { mealsEnabled: true },
      });
      mealsEnabled = f?.mealsEnabled ?? false;
    }
    return {
      ...principal,
      mealsEnabled,
      permissions: [...getPermissionsForPrincipal(principal)],
    };
  }
}
