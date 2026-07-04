import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';

export const ALL_FACILITIES = 'all';

/**
 * facilityId パラメータを、実際にクエリする店舗IDの配列へ解決する。
 * - 'all' → principal がアクセスできる全店舗
 * - それ以外 → その店舗（アクセス検証つき）
 */
export async function resolveFacilityIds(
  prisma: PrismaService,
  principal: Principal,
  facilityId: string,
): Promise<string[]> {
  const scope = computeAccessScope(principal);

  if (facilityId && facilityId !== ALL_FACILITIES) {
    const f = await prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!f) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, f)) {
      throw new ForbiddenException('この店舗を操作する権限がありません');
    }
    return [facilityId];
  }

  // 全店舗
  if (scope.crossTenant) {
    const fs = await prisma.facility.findMany({ select: { id: true } });
    return fs.map((f) => f.id);
  }
  if (scope.allFacilitiesInCorporation) {
    const fs = await prisma.facility.findMany({
      where: { corporationId: scope.corporationId ?? '__none__' },
      select: { id: true },
    });
    return fs.map((f) => f.id);
  }
  return scope.facilityIds;
}
