import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { getPermissionsForPrincipal } from './permissions';
import { Principal } from './principal.types';

@Controller()
export class AuthController {
  /**
   * GET /me — ログイン中の本人情報＋解決済みの権限一覧を返す。
   * 認証は全体適用の AuthGuard が行う（principal解決済み）。
   */
  @Get('me')
  me(@CurrentUser() principal: Principal) {
    return {
      ...principal,
      permissions: [...getPermissionsForPrincipal(principal)],
    };
  }
}
