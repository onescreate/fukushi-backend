import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessFacility, computeAccessScope } from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { mapAddressContact } from '../common/dto/address-contact.mapper';
import { CreateFacilityDto } from './dto/create-facility.dto';
import { UpdateFacilityDto } from './dto/update-facility.dto';

@Injectable()
export class FacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  /** principal のテナント範囲で絞った店舗一覧 */
  list(principal: Principal) {
    const scope = computeAccessScope(principal);
    let where: Prisma.FacilityWhereInput = {};
    if (!scope.crossTenant) {
      where = scope.allFacilitiesInCorporation
        ? { corporationId: scope.corporationId ?? '__none__' }
        : {
            corporationId: scope.corporationId ?? '__none__',
            id: { in: scope.facilityIds },
          };
    }
    return this.prisma.facility.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      include: {
        corporation: { select: { name: true } },
        _count: { select: { users: true } },
      },
    });
  }

  private async getOrThrow(id: string) {
    const facility = await this.prisma.facility.findUnique({ where: { id } });
    if (!facility) throw new NotFoundException('店舗が見つかりません');
    return facility;
  }

  async create(principal: Principal, dto: CreateFacilityDto) {
    const scope = computeAccessScope(principal);

    // 法人管理者は自法人にしか作れない（システム管理者は任意の法人）
    const corporationId = scope.crossTenant
      ? dto.corporationId
      : (scope.corporationId as string);
    if (!scope.crossTenant && dto.corporationId !== scope.corporationId) {
      throw new ForbiddenException('自法人以外の店舗は作成できません');
    }

    const corp = await this.prisma.corporation
      .findUnique({ where: { id: corporationId } })
      .catch(() => null); // 不正なID形式などはDBエラーになるため握りつぶす
    if (!corp) throw new BadRequestException('法人が存在しません');

    return this.prisma.facility.create({
      data: {
        corporationId,
        name: dto.name,
        serviceType: dto.serviceType,
        mealsEnabled: dto.mealsEnabled ?? false,
        email: dto.email,
        remarks: dto.remarks,
        status: dto.status ?? 'active',
        ...mapAddressContact(dto),
      },
    });
  }

  async update(principal: Principal, id: string, dto: UpdateFacilityDto) {
    const facility = await this.getOrThrow(id);
    const scope = computeAccessScope(principal);
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗を操作する権限がありません');
    }
    return this.prisma.facility.update({
      where: { id },
      data: {
        name: dto.name,
        serviceType: dto.serviceType,
        mealsEnabled: dto.mealsEnabled,
        email: dto.email,
        remarks: dto.remarks,
        status: dto.status,
        ...mapAddressContact(dto),
      },
    });
  }

  async remove(principal: Principal, id: string) {
    const facility = await this.prisma.facility.findUnique({
      where: { id },
      include: { _count: { select: { users: true } } },
    });
    if (!facility) throw new NotFoundException('店舗が見つかりません');

    const scope = computeAccessScope(principal);
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗を操作する権限がありません');
    }
    if (facility._count.users > 0) {
      throw new BadRequestException(
        '利用者が登録されているため削除できません。先に利用者を移動・削除してください。',
      );
    }
    await this.prisma.facility.delete({ where: { id } });
    return { ok: true };
  }
}
