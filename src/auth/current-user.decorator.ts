import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AuthedRequest } from './auth.guard';
import { Principal } from './principal.types';

/**
 * コントローラの引数で、AuthGuardが解決した実行主体(principal)を受け取るデコレータ。
 * 例: me(@CurrentUser() principal: Principal) {}
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): Principal | undefined => {
    const req = ctx.switchToHttp().getRequest<AuthedRequest>();
    return req.principal;
  },
);
