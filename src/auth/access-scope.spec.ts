import { Role } from '@prisma/client';
import {
  canAccessCorporation,
  canAccessFacility,
  computeAccessScope,
} from './access-scope';
import { Principal } from './principal.types';

const staff = (
  corporationId: string,
  roles: { facilityId: string | null; role: Role }[],
): Principal => ({
  type: 'staff',
  id: 'S1',
  firebaseUid: 'uid',
  corporationId,
  email: 'a@b.c',
  name: 'テスト 職員',
  roles,
});

const user = (corporationId: string, facilityId: string): Principal => ({
  type: 'user',
  id: 'U1',
  firebaseUid: 'uid',
  corporationId,
  facilityId,
  loginId: 'login',
  name: 'テスト 利用者',
});

describe('computeAccessScope', () => {
  it('system_admin は全法人アクセス可(crossTenant)', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: null, role: Role.system_admin }]),
    );
    expect(s.crossTenant).toBe(true);
    expect(s.allFacilitiesInCorporation).toBe(true);
  });

  it('corporation_admin は自法人の全店舗', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: null, role: Role.corporation_admin }]),
    );
    expect(s.crossTenant).toBe(false);
    expect(s.corporationId).toBe('C1');
    expect(s.allFacilitiesInCorporation).toBe(true);
  });

  it('facility staff は割当店舗のみ', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: 'F1', role: Role.staff }]),
    );
    expect(s.crossTenant).toBe(false);
    expect(s.allFacilitiesInCorporation).toBe(false);
    expect(s.facilityIds).toEqual(['F1']);
  });

  it('利用者は自分の店舗のみ', () => {
    const s = computeAccessScope(user('C1', 'F1'));
    expect(s.crossTenant).toBe(false);
    expect(s.facilityIds).toEqual(['F1']);
  });
});

describe('canAccessCorporation', () => {
  it('同一法人は可・他法人は不可', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: 'F1', role: Role.staff }]),
    );
    expect(canAccessCorporation(s, 'C1')).toBe(true);
    expect(canAccessCorporation(s, 'C2')).toBe(false);
  });

  it('system_admin は他法人も可', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: null, role: Role.system_admin }]),
    );
    expect(canAccessCorporation(s, 'C2')).toBe(true);
  });
});

describe('canAccessFacility', () => {
  const facFin = { id: 'F1', corporationId: 'C1' };
  const facOtherInCorp = { id: 'F2', corporationId: 'C1' };
  const facOtherCorp = { id: 'F9', corporationId: 'C2' };

  it('facility staff は割当店舗のみ可（同法人の別店舗も不可）', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: 'F1', role: Role.staff }]),
    );
    expect(canAccessFacility(s, facFin)).toBe(true);
    expect(canAccessFacility(s, facOtherInCorp)).toBe(false);
    expect(canAccessFacility(s, facOtherCorp)).toBe(false);
  });

  it('corporation_admin は自法人の全店舗可・他法人は不可', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: null, role: Role.corporation_admin }]),
    );
    expect(canAccessFacility(s, facFin)).toBe(true);
    expect(canAccessFacility(s, facOtherInCorp)).toBe(true);
    expect(canAccessFacility(s, facOtherCorp)).toBe(false);
  });

  it('system_admin はどの店舗も可', () => {
    const s = computeAccessScope(
      staff('C1', [{ facilityId: null, role: Role.system_admin }]),
    );
    expect(canAccessFacility(s, facOtherCorp)).toBe(true);
  });
});
