import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './current-user.decorator';
import { Principal } from './principal.types';
import { RequirePermission } from './require-permission.decorator';

@Controller()
export class AuthController {
  /**
   * GET /me — ログイン中の本人情報を返す。
   * 認証は全体適用の AuthGuard が行う（principal解決済み）。
   */
  @Get('me')
  me(@CurrentUser() principal: Principal) {
    return principal;
  }

  /**
   * GET /debug/rbac — 権限ガードの動作確認用（Step 1-0）。
   * corporation.manage 権限（＝実質 system_admin）が必要。
   * ※ 検証が済んだら削除予定。
   */
  @RequirePermission('corporation.manage')
  @Get('debug/rbac')
  rbacCheck(@CurrentUser() principal: Principal) {
    return {
      ok: true,
      message: 'corporation.manage 権限が確認できました',
      who: principal.name,
    };
  }
}
