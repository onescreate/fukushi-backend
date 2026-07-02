import { Principal } from './principal.types';

/**
 * principal がアクセスできるテナント範囲。
 * 各リソースのサービス層で、クエリの絞り込み・操作可否の検証に使う
 * （クライアントが送ってくる法人/店舗IDは信用せず、これで判定する）。
 */
export interface AccessScope {
  /** system_admin: 全法人にアクセス可 */
  crossTenant: boolean;
  /** 所属法人（crossTenant のときは null＝制限なし） */
  corporationId: string | null;
  /** corporation_admin: 法人内の全店舗にアクセス可 */
  allFacilitiesInCorporation: boolean;
  /** 限定された店舗ID（allFacilitiesInCorporation=false のとき有効） */
  facilityIds: string[];
}

/** principal からアクセス範囲を計算する。 */
export function computeAccessScope(principal: Principal): AccessScope {
  if (principal.type === 'user') {
    // 利用者は管理スコープを持たない（自分自身のデータのみ、各機能で別途制御）
    return {
      crossTenant: false,
      corporationId: principal.corporationId,
      allFacilitiesInCorporation: false,
      facilityIds: [principal.facilityId],
    };
  }

  if (principal.roles.some((r) => r.role === 'system_admin')) {
    return {
      crossTenant: true,
      corporationId: null,
      allFacilitiesInCorporation: true,
      facilityIds: [],
    };
  }

  // corporation_admin、または facilityId=null の割当は法人全体を意味する
  const allInCorp = principal.roles.some(
    (r) => r.role === 'corporation_admin' || r.facilityId === null,
  );
  const facilityIds = [
    ...new Set(
      principal.roles
        .map((r) => r.facilityId)
        .filter((f): f is string => f !== null),
    ),
  ];

  return {
    crossTenant: false,
    corporationId: principal.corporationId,
    allFacilitiesInCorporation: allInCorp,
    facilityIds,
  };
}

/** 指定の法人にアクセスできるか。 */
export function canAccessCorporation(
  scope: AccessScope,
  corporationId: string,
): boolean {
  if (scope.crossTenant) return true;
  return scope.corporationId === corporationId;
}

/** 指定の店舗にアクセスできるか。 */
export function canAccessFacility(
  scope: AccessScope,
  facility: { id: string; corporationId: string },
): boolean {
  if (scope.crossTenant) return true;
  if (scope.corporationId !== facility.corporationId) return false;
  if (scope.allFacilitiesInCorporation) return true;
  return scope.facilityIds.includes(facility.id);
}
