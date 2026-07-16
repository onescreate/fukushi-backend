import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { AuthedRequest } from './auth.guard';
import {
  canAccessCorporation,
  canAccessFacility,
  computeAccessScope,
} from './access-scope';
import { ALL_FACILITIES } from '../common/facility-scope';
import { IS_PUBLIC_KEY } from './public.decorator';

/**
 * TenantGuard: リクエストに含まれる「クライアント指定の法人ID/店舗ID」が、
 * 実行主体(principal)のアクセス範囲(AccessScope)を超えていないかを *入口で機構的に* 検証する。
 *
 * 目的: 各サービスに手書きされたスコープチェックへの依存を減らし、
 *       「新しいエンドポイントでチェックを書き忘れる → 他テナントに漏えい」という構造リスクを塞ぐ。
 *       （マルチテナントSaaSの、顧客(法人)をまたぐ最重要境界を守る）
 *
 * 判定ルール:
 *   - @Public / principal 無し            → スキップ（認証は AuthGuard が担保）
 *   - crossTenant(system_admin)           → 常に許可（全法人アクセス可）
 *   - facilityId === 'all'                → スキップ（範囲内の全店舗の意味。実解決はサービス側）
 *   - corporationId が範囲外              → 403
 *   - facilityId が実在し かつ 範囲外      → 403（存在しないIDはサービス側の 404/検証に委ねる）
 *
 * ※ 権限（その操作をして良いか）は RbacGuard の担当。ここは「どのテナントに触れるか」だけを見る。
 * ※ 既存サービスのスコープ判定はそのまま残す（多層防御）。本Guardは追加の安全網。
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const principal = req.principal;
    if (!principal) return true; // 認証は AuthGuard が担保済み

    const scope = computeAccessScope(principal);
    if (scope.crossTenant) return true; // 全法人アクセス可（ベンダー）

    const corporationId = this.pick(req, 'corporationId');
    if (corporationId && !canAccessCorporation(scope, corporationId)) {
      throw new ForbiddenException('この法人を操作する権限がありません');
    }

    const facilityId = this.pick(req, 'facilityId');
    if (facilityId && facilityId !== ALL_FACILITIES) {
      const f = await this.prisma.facility.findUnique({
        where: { id: facilityId },
        select: { id: true, corporationId: true },
      });
      if (f && !canAccessFacility(scope, f)) {
        throw new ForbiddenException('この店舗を操作する権限がありません');
      }
    }

    return true;
  }

  /** params → body → query の順で識別子(文字列)を探す。最初に見つかった非空文字列を返す。 */
  private pick(req: AuthedRequest, key: string): string | null {
    const sources: unknown[] = [req.params, req.body, req.query];
    for (const src of sources) {
      const v = (src as Record<string, unknown> | undefined)?.[key];
      if (typeof v === 'string' && v.length > 0) return v;
    }
    return null;
  }
}
