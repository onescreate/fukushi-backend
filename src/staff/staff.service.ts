import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';

const FACILITY_SCOPED: Role[] = ['facility_admin', 'staff'];

/** 作成者のスコープに応じて付与可能なロール */
function allowedRoles(scope: AccessScope): Role[] {
  if (scope.crossTenant)
    return ['system_admin', 'corporation_admin', 'facility_admin', 'staff'];
  if (scope.allFacilitiesInCorporation)
    return ['corporation_admin', 'facility_admin', 'staff'];
  return ['staff'];
}

@Injectable()
export class StaffService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  private readonly include = {
    facilityRoles: { include: { facility: { select: { name: true } } } },
  } satisfies Prisma.StaffInclude;

  list(principal: Principal) {
    const scope = computeAccessScope(principal);
    let where: Prisma.StaffWhereInput = {};
    if (!scope.crossTenant) {
      where = scope.allFacilitiesInCorporation
        ? { corporationId: scope.corporationId ?? '__none__' }
        : {
            corporationId: scope.corporationId ?? '__none__',
            facilityRoles: { some: { facilityId: { in: scope.facilityIds } } },
          };
    }
    return this.prisma.staff.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: this.include,
    });
  }

  private getWithRoles(id: string) {
    return this.prisma.staff.findUniqueOrThrow({
      where: { id },
      include: this.include,
    });
  }

  /** 対象職員を操作できるか検証し、レコードを返す */
  private async assertCanManage(scope: AccessScope, id: string) {
    const staff = await this.prisma.staff.findUnique({
      where: { id },
      include: { facilityRoles: true },
    });
    if (!staff) throw new NotFoundException('職員が見つかりません');
    if (scope.crossTenant) return staff;
    if (staff.corporationId !== scope.corporationId) {
      throw new ForbiddenException('この職員を操作する権限がありません');
    }
    if (scope.allFacilitiesInCorporation) return staff;
    const overlap = staff.facilityRoles.some(
      (r) => r.facilityId && scope.facilityIds.includes(r.facilityId),
    );
    if (!overlap) throw new ForbiddenException('この職員を操作する権限がありません');
    return staff;
  }

  /** ロール割当の妥当性を検証し、確定した (corporationId, facilityId) を返す */
  private async resolveAssignment(
    scope: AccessScope,
    corporationId: string,
    role: Role,
    facilityId?: string,
  ): Promise<{ corporationId: string; facilityId: string | null }> {
    // 法人スコープ
    const corpId = scope.crossTenant
      ? corporationId
      : (scope.corporationId as string);
    if (!scope.crossTenant && corporationId !== scope.corporationId) {
      throw new ForbiddenException('自法人以外には作成できません');
    }
    const corp = await this.prisma.corporation
      .findUnique({ where: { id: corpId } })
      .catch(() => null);
    if (!corp) throw new BadRequestException('法人が存在しません');

    // ロールの妥当性
    if (!allowedRoles(scope).includes(role)) {
      throw new ForbiddenException('その権限は付与できません');
    }

    // 店舗スコープ
    if (FACILITY_SCOPED.includes(role)) {
      if (!facilityId) throw new BadRequestException('店舗を選択してください');
      const facility = await this.prisma.facility
        .findUnique({ where: { id: facilityId } })
        .catch(() => null);
      if (!facility || facility.corporationId !== corpId) {
        throw new BadRequestException('店舗が正しくありません');
      }
      if (!canAccessFacility(scope, facility)) {
        throw new ForbiddenException('その店舗には割り当てできません');
      }
      return { corporationId: corpId, facilityId: facility.id };
    }
    return { corporationId: corpId, facilityId: null };
  }

  async create(principal: Principal, dto: CreateStaffDto) {
    const scope = computeAccessScope(principal);
    const { corporationId, facilityId } = await this.resolveAssignment(
      scope,
      dto.corporationId,
      dto.role,
      dto.facilityId,
    );

    // 先にFirebaseユーザーを作成
    let uid: string;
    try {
      uid = await this.firebase.createUser({
        email: dto.email,
        password: dto.password,
        displayName: `${dto.lastName} ${dto.firstName}`,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        throw new BadRequestException('このメールアドレスは既に使われています');
      }
      throw new BadRequestException('アカウントの作成に失敗しました');
    }

    // DB登録（失敗時はFirebaseユーザーを削除して整合を保つ）
    try {
      const staff = await this.prisma.$transaction(async (tx) => {
        const s = await tx.staff.create({
          data: {
            corporationId,
            firebaseUid: uid,
            lastName: dto.lastName,
            firstName: dto.firstName,
            email: dto.email,
          },
        });
        await tx.staffFacilityRole.create({
          data: { staffId: s.id, facilityId, role: dto.role },
        });
        return s;
      });
      return this.getWithRoles(staff.id);
    } catch (e) {
      await this.firebase.deleteUser(uid).catch(() => undefined);
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('このメールアドレスは既に使われています');
      }
      throw new BadRequestException('職員の作成に失敗しました');
    }
  }

  async update(principal: Principal, id: string, dto: UpdateStaffDto) {
    const scope = computeAccessScope(principal);
    const staff = await this.assertCanManage(scope, id);

    await this.prisma.staff.update({
      where: { id },
      data: {
        lastName: dto.lastName,
        firstName: dto.firstName,
        status: dto.status,
      },
    });

    // ロール変更（指定時のみ、既存を置き換え）
    if (dto.role) {
      const { facilityId } = await this.resolveAssignment(
        scope,
        staff.corporationId,
        dto.role,
        dto.facilityId,
      );
      await this.prisma.$transaction([
        this.prisma.staffFacilityRole.deleteMany({ where: { staffId: id } }),
        this.prisma.staffFacilityRole.create({
          data: { staffId: id, facilityId, role: dto.role },
        }),
      ]);
    }
    return this.getWithRoles(id);
  }

  async resetPassword(principal: Principal, id: string, password: string) {
    const scope = computeAccessScope(principal);
    const staff = await this.assertCanManage(scope, id);
    if (!staff.firebaseUid) {
      throw new BadRequestException('この職員にはログインアカウントがありません');
    }
    await this.firebase.setPassword(staff.firebaseUid, password);
    return { ok: true };
  }

  async remove(principal: Principal, id: string) {
    const scope = computeAccessScope(principal);
    const staff = await this.assertCanManage(scope, id);
    await this.prisma.staff.delete({ where: { id } });
    if (staff.firebaseUid) {
      await this.firebase.deleteUser(staff.firebaseUid).catch(() => undefined);
    }
    return { ok: true };
  }

  /** 職員フォームの店舗選択肢（スコープ内） */
  facilityOptions(principal: Principal) {
    const scope = computeAccessScope(principal);
    // ポータル連携済み(福祉事業所として指定)かつ有効な店舗のみ
    const where: Prisma.FacilityWhereInput = {
      externalShopId: { not: null },
      status: 'active',
    };
    if (!scope.crossTenant) {
      where.corporationId = scope.corporationId ?? '__none__';
      if (!scope.allFacilitiesInCorporation) {
        where.id = { in: scope.facilityIds };
      }
    }
    return this.prisma.facility.findMany({
      where,
      select: { id: true, name: true, corporationId: true },
      orderBy: { name: 'asc' },
    });
  }
}
