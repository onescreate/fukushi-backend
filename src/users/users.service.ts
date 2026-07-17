import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { FirebaseService } from '../firebase/firebase.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';

// 利用者の自宅ログイン用・合成メールのドメイン（実在不要の内部専用）
const USER_EMAIL_DOMAIN = 'users.fukushi.local';

// 返却する安全なフィールド（pinCode/firebaseUid は含めない）
const SAFE_SELECT = {
  id: true,
  corporationId: true,
  facilityId: true,
  loginId: true,
  lastName: true,
  firstName: true,
  kana: true,
  certNumber: true,
  useSpecialMealFee: true,
  heightCm: true,
  status: true,
  createdAt: true,
  facility: { select: { name: true } },
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly firebase: FirebaseService,
  ) {}

  list(principal: Principal) {
    const scope = computeAccessScope(principal);
    let where: Prisma.UserWhereInput = {};
    if (!scope.crossTenant) {
      where = scope.allFacilitiesInCorporation
        ? { corporationId: scope.corporationId ?? '__none__' }
        : { facilityId: { in: scope.facilityIds } };
    }
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: SAFE_SELECT,
    });
  }

  private async facilityInScope(scope: AccessScope, facilityId: string) {
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('その店舗には登録できません');
    }
    return facility;
  }

  private async assertCanManage(scope: AccessScope, id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('利用者が見つかりません');
    if (
      !canAccessFacility(scope, {
        id: user.facilityId,
        corporationId: user.corporationId,
      })
    ) {
      throw new ForbiddenException('この利用者を操作する権限がありません');
    }
    return user;
  }

  async create(principal: Principal, dto: CreateUserDto) {
    const scope = computeAccessScope(principal);
    const facility = await this.facilityInScope(scope, dto.facilityId);

    const dup = await this.prisma.user.findUnique({
      where: { loginId: dto.loginId },
    });
    if (dup) throw new BadRequestException('このログインIDは既に使われています');

    const pinHash = await bcrypt.hash(dto.pin, 10);
    const email = `${dto.loginId}@${USER_EMAIL_DOMAIN}`;

    let uid: string;
    try {
      uid = await this.firebase.createUser({
        email,
        password: dto.password,
        displayName: `${dto.lastName} ${dto.firstName}`,
      });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === 'auth/email-already-exists') {
        throw new BadRequestException('このログインIDは既に使われています');
      }
      throw new BadRequestException('アカウントの作成に失敗しました');
    }

    try {
      const user = await this.prisma.user.create({
        data: {
          corporationId: facility.corporationId,
          facilityId: facility.id,
          loginId: dto.loginId,
          firebaseUid: uid,
          lastName: dto.lastName,
          firstName: dto.firstName,
          kana: dto.kana,
          pinCode: pinHash,
          certNumber: dto.certNumber,
          useSpecialMealFee: dto.useSpecialMealFee ?? false,
          heightCm: dto.heightCm,
          status: dto.status ?? 'active',
        },
        select: SAFE_SELECT,
      });
      return user;
    } catch (e) {
      await this.firebase.deleteUser(uid).catch(() => undefined);
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('このログインIDは既に使われています');
      }
      throw new BadRequestException('利用者の作成に失敗しました');
    }
  }

  async update(principal: Principal, id: string, dto: UpdateUserDto) {
    const scope = computeAccessScope(principal);
    await this.assertCanManage(scope, id);

    // 店舗移動する場合は移動先もスコープ内か検証
    if (dto.facilityId) {
      await this.facilityInScope(scope, dto.facilityId);
    }

    return this.prisma.user.update({
      where: { id },
      data: {
        lastName: dto.lastName,
        firstName: dto.firstName,
        kana: dto.kana,
        facilityId: dto.facilityId,
        certNumber: dto.certNumber,
        useSpecialMealFee: dto.useSpecialMealFee,
        heightCm: dto.heightCm,
        status: dto.status,
      },
      select: SAFE_SELECT,
    });
  }

  async resetPin(principal: Principal, id: string, pin: string) {
    const scope = computeAccessScope(principal);
    await this.assertCanManage(scope, id);
    const pinHash = await bcrypt.hash(pin, 10);
    await this.prisma.user.update({
      where: { id },
      data: { pinCode: pinHash },
    });
    return { ok: true };
  }

  async resetPassword(principal: Principal, id: string, password: string) {
    const scope = computeAccessScope(principal);
    const user = await this.assertCanManage(scope, id);
    if (!user.firebaseUid) {
      throw new BadRequestException('この利用者にはログインアカウントがありません');
    }
    await this.firebase.setPassword(user.firebaseUid, password);
    return { ok: true };
  }

  async remove(principal: Principal, id: string) {
    const scope = computeAccessScope(principal);
    const user = await this.assertCanManage(scope, id);
    await this.prisma.user.delete({ where: { id } });
    if (user.firebaseUid) {
      await this.firebase.deleteUser(user.firebaseUid).catch(() => undefined);
    }
    return { ok: true };
  }

  facilityOptions(principal: Principal) {
    const scope = computeAccessScope(principal);
    // ポータル連携済み(福祉事業所として指定)かつ有効な店舗のみ表示する
    const where: Prisma.FacilityWhereInput = {
      externalShopId: { not: null },
      status: 'active',
    };
    if (!scope.crossTenant) {
      if (scope.allFacilitiesInCorporation) {
        where.corporationId = scope.corporationId ?? '__none__';
      } else {
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
