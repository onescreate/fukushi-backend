import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { UpsertMealPricingDto } from './dto/meal-pricing.dto';

@Injectable()
export class MealPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 店舗を取得しアクセス可否を検証する。 */
  private async assertFacility(principal: Principal, facilityId: string) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の食事料金を操作する権限がありません');
    }
    return facility;
  }

  /**
   * 店舗の食事料金を履歴の新しい順で一覧。
   * 現在（今日）適用中の行に isCurrent=true を付ける。
   */
  async list(principal: Principal, facilityId: string) {
    await this.assertFacility(principal, facilityId);
    const rows = await this.prisma.mealPricing.findMany({
      where: { facilityId },
      orderBy: { effectiveDate: 'desc' },
    });
    const today = new Date().toISOString().slice(0, 10);
    // 今日以前で最も新しい適用開始日の行が「現在適用中」
    const currentId = rows.find(
      (r) => r.effectiveDate.toISOString().slice(0, 10) <= today,
    )?.id;
    return rows.map((r) => ({
      id: r.id,
      facilityId: r.facilityId,
      effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
      mealFee: r.mealFee,
      cancelFee: r.cancelFee,
      isCurrent: r.id === currentId,
    }));
  }

  async create(
    principal: Principal,
    facilityId: string,
    dto: UpsertMealPricingDto,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const exists = await this.prisma.mealPricing.findUnique({
      where: {
        facilityId_effectiveDate: {
          facilityId,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (exists) {
      throw new BadRequestException('同じ適用開始日の料金が既に登録されています');
    }
    await this.prisma.mealPricing.create({
      data: {
        corporationId: facility.corporationId,
        facilityId,
        effectiveDate: new Date(dto.effectiveDate),
        mealFee: dto.mealFee,
        cancelFee: dto.cancelFee,
        createdBy: staffId,
        updatedBy: staffId,
      },
    });
    return this.list(principal, facilityId);
  }

  async update(
    principal: Principal,
    facilityId: string,
    id: string,
    dto: UpsertMealPricingDto,
  ) {
    await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const row = await this.prisma.mealPricing.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('料金が見つかりません');
    }
    // 適用開始日を変える場合は他行と重複しないこと
    const dupe = await this.prisma.mealPricing.findUnique({
      where: {
        facilityId_effectiveDate: {
          facilityId,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (dupe && dupe.id !== id) {
      throw new BadRequestException('同じ適用開始日の料金が既に登録されています');
    }
    await this.prisma.mealPricing.update({
      where: { id },
      data: {
        effectiveDate: new Date(dto.effectiveDate),
        mealFee: dto.mealFee,
        cancelFee: dto.cancelFee,
        updatedBy: staffId,
      },
    });
    return this.list(principal, facilityId);
  }

  async remove(principal: Principal, facilityId: string, id: string) {
    await this.assertFacility(principal, facilityId);
    const row = await this.prisma.mealPricing.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('料金が見つかりません');
    }
    await this.prisma.mealPricing.delete({ where: { id } });
    return this.list(principal, facilityId);
  }
}
