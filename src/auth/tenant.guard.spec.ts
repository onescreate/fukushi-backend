import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { TenantGuard } from './tenant.guard';
import { Principal } from './principal.types';

/** テスト用のモック群 */
const facilityStaff: Principal = {
  type: 'staff',
  id: 'S1',
  firebaseUid: 'uid',
  corporationId: 'C1',
  email: 'a@b.c',
  name: '職員',
  roles: [{ facilityId: 'F1', role: Role.staff }],
};

const systemAdmin: Principal = {
  ...facilityStaff,
  roles: [{ facilityId: null, role: Role.system_admin }],
};

function makeCtx(
  req: Record<string, unknown>,
): ExecutionContext {
  return {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeGuard(opts: {
  isPublic?: boolean;
  facility?: { id: string; corporationId: string } | null;
}) {
  const reflector = {
    getAllAndOverride: () => opts.isPublic ?? false,
  } as unknown as Reflector;
  const findUnique = jest.fn().mockResolvedValue(opts.facility ?? null);
  const prisma = { facility: { findUnique } } as any;
  return { guard: new TenantGuard(prisma, reflector), findUnique };
}

describe('TenantGuard', () => {
  it('@Public はスキップして通す', async () => {
    const { guard } = makeGuard({ isPublic: true });
    await expect(
      guard.canActivate(makeCtx({ params: { facilityId: 'F9' } })),
    ).resolves.toBe(true);
  });

  it('principal が無ければ通す（認証はAuthGuard担当）', async () => {
    const { guard } = makeGuard({});
    await expect(guard.canActivate(makeCtx({}))).resolves.toBe(true);
  });

  it('system_admin はどの店舗IDでも通す', async () => {
    const { guard, findUnique } = makeGuard({});
    await expect(
      guard.canActivate(
        makeCtx({ principal: systemAdmin, params: { facilityId: 'F9' } }),
      ),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled(); // crossTenantで即許可
  });

  it('自店舗(F1)は通す', async () => {
    const { guard } = makeGuard({ facility: { id: 'F1', corporationId: 'C1' } });
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, params: { facilityId: 'F1' } }),
      ),
    ).resolves.toBe(true);
  });

  it('他法人の店舗(F9/C2)は403で弾く', async () => {
    const { guard } = makeGuard({ facility: { id: 'F9', corporationId: 'C2' } });
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, query: { facilityId: 'F9' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('同法人でも割当外の店舗(F2/C1)は403で弾く', async () => {
    const { guard } = makeGuard({ facility: { id: 'F2', corporationId: 'C1' } });
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, body: { facilityId: 'F2' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('他法人の corporationId は403で弾く', async () => {
    const { guard } = makeGuard({});
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, params: { corporationId: 'C2' } }),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("facilityId='all' は店舗照会せず通す（範囲内の全店舗の意味）", async () => {
    const { guard, findUnique } = makeGuard({});
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, query: { facilityId: 'all' } }),
      ),
    ).resolves.toBe(true);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('存在しない店舗IDはここでは弾かない（サービス側の404/検証に委ねる）', async () => {
    const { guard } = makeGuard({ facility: null });
    await expect(
      guard.canActivate(
        makeCtx({ principal: facilityStaff, params: { facilityId: 'F-none' } }),
      ),
    ).resolves.toBe(true);
  });
});
