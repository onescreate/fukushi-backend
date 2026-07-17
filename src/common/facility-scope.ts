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
 * - 'all' または未指定 → principal がアクセスできる全店舗
 * - 単一ID → その店舗（アクセス検証つき）
 * - カンマ区切りの複数ID（例 "id1,id2"）→ 指定された複数店舗を合算（各店舗アクセス検証つき）
 */
export async function resolveFacilityIds(
  prisma: PrismaService,
  principal: Principal,
  facilityId: string,
): Promise<string[]> {
  const scope = computeAccessScope(principal);

  // カンマ区切りで複数店舗を許容（'all'トークンや空要素は無視）
  const requested = [
    ...new Set(
      (facilityId ?? '')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s && s !== ALL_FACILITIES),
    ),
  ];

  if (requested.length > 0) {
    const fs = await prisma.facility.findMany({
      where: { id: { in: requested } },
    });
    if (fs.length !== requested.length) {
      throw new BadRequestException('店舗が存在しません');
    }
    for (const f of fs) {
      if (!canAccessFacility(scope, f)) {
        throw new ForbiddenException('この店舗を操作する権限がありません');
      }
    }
    return requested;
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
