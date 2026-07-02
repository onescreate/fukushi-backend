import { Role } from '@prisma/client';

/** 職員が持つ「店舗×ロール」の割当（facilityId=null は法人全体） */
export interface FacilityRoleScope {
  facilityId: string | null;
  role: Role;
}

/** 認証済みの職員 */
export interface StaffPrincipal {
  type: 'staff';
  id: string;
  firebaseUid: string;
  corporationId: string;
  email: string;
  name: string;
  roles: FacilityRoleScope[];
}

/** 認証済みの利用者 */
export interface UserPrincipal {
  type: 'user';
  id: string;
  firebaseUid: string;
  corporationId: string;
  facilityId: string;
  loginId: string;
  name: string;
}

/** リクエストの実行主体（サーバーがトークンから解決する） */
export type Principal = StaffPrincipal | UserPrincipal;
