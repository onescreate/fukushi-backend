import { Role } from '@prisma/client';
import { Principal } from './principal.types';

/**
 * 権限（ケイパビリティ）の一覧。機能単位で定義する。
 * ロールがこれらを束ねる（設計書5.2）。
 */
export const PERMISSIONS = [
  'corporation.manage', // 法人の作成・編集（システム管理者のみ）
  'store.manage', // 店舗の作成・編集
  'staff.manage', // 職員の管理
  'user.view',
  'user.manage', // 利用者の管理
  'schedule.view',
  'schedule.submit',
  'schedule.approve',
  'attendance.view',
  'attendance.edit',
  'meal.view',
  'meal.manage',
  'meal.delivery.manage',
  'billing.view',
  'billing.issue',
  'billing.payment',
  'settings.price',
  'settings.tax', // 消費税設定（システム管理者のみ）
  'health.view',
  'health.edit',
  'closing.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ALL: Permission[] = [...PERMISSIONS];

/**
 * ロール → 付与する権限。
 * system_admin は全権限。下位ほど範囲を絞る。
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  system_admin: ALL,

  corporation_admin: ALL.filter(
    (p) => p !== 'corporation.manage' && p !== 'settings.tax',
  ),

  facility_admin: [
    'store.manage',
    'staff.manage',
    'user.view',
    'user.manage',
    'schedule.view',
    'schedule.submit',
    'schedule.approve',
    'attendance.view',
    'attendance.edit',
    'meal.view',
    'meal.manage',
    'meal.delivery.manage',
    'billing.view',
    'billing.issue',
    'billing.payment',
    'settings.price',
    'health.view',
    'health.edit',
    'closing.manage',
  ],

  staff: [
    'user.view',
    'schedule.view',
    'schedule.submit',
    'attendance.view',
    'attendance.edit',
    'meal.view',
    'meal.manage',
    'billing.view',
    'health.view',
    'health.edit',
  ],
};

/**
 * principal が実際に持つ権限の集合を求める。
 * 職員は割り当てられた全ロールの権限の和集合。利用者は管理権限なし。
 */
export function getPermissionsForPrincipal(
  principal: Principal,
): Set<Permission> {
  if (principal.type !== 'staff') return new Set();
  const set = new Set<Permission>();
  for (const { role } of principal.roles) {
    for (const perm of ROLE_PERMISSIONS[role] ?? []) set.add(perm);
  }
  return set;
}

export function hasPermission(
  principal: Principal,
  permission: Permission,
): boolean {
  return getPermissionsForPrincipal(principal).has(permission);
}
