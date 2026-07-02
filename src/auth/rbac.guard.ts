import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthedRequest } from './auth.guard';
import { getPermissionsForPrincipal, Permission } from './permissions';
import { REQUIRE_PERMISSION_KEY } from './require-permission.decorator';

/**
 * RbacGuard: エンドポイントが宣言した必要権限を、principal が持っているか判定する。
 * AuthGuard の後に実行される（principal 解決済み前提）。
 */
@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRE_PERMISSION_KEY,
      [context.getHandler(), context.getClass()],
    );

    // 権限指定が無いエンドポイントは、認証さえ通っていれば許可
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal) {
      throw new ForbiddenException('認証情報がありません');
    }

    const owned = getPermissionsForPrincipal(principal);
    const ok = required.every((p) => owned.has(p));
    if (!ok) {
      throw new ForbiddenException('この操作を行う権限がありません');
    }
    return true;
  }
}
