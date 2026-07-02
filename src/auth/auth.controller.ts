import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthGuard } from './auth.guard';
import { CurrentUser } from './current-user.decorator';
import { Principal } from './principal.types';

@Controller()
export class AuthController {
  /**
   * GET /me — ログイン中の本人情報（誰で・どの法人/店舗の・どの権限か）を返す。
   * トークン検証とprincipal解決は AuthGuard が行う。
   */
  @UseGuards(AuthGuard)
  @Get('me')
  me(@CurrentUser() principal: Principal) {
    return principal;
  }
}
