import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { TaxCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessCorporation,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { UpsertTaxSettingDto } from './dto/tax-setting.dto';

@Injectable()
export class TaxSettingService {
  constructor(private readonly prisma: PrismaService) {}

  /** 法人へのアクセス可否を検証する。 */
  private async assertCorporation(principal: Principal, corporationId: string) {
    const scope = computeAccessScope(principal);
    if (!canAccessCorporation(scope, corporationId)) {
      throw new ForbiddenException('この法人の税設定を操作する権限がありません');
    }
    const corp = await this.prisma.corporation
      .findUnique({ where: { id: corporationId } })
      .catch(() => null);
    if (!corp) throw new BadRequestException('法人が存在しません');
    return corp;
  }

  /**
   * 法人の税設定を履歴の新しい順で一覧。
   * 区分（標準/軽減）ごとに、今日以前で最新の行を「適用中」とする。
   */
  async list(principal: Principal, corporationId: string) {
    await this.assertCorporation(principal, corporationId);
    const rows = await this.prisma.taxSetting.findMany({
      where: { corporationId },
      orderBy: [{ category: 'asc' }, { effectiveDate: 'desc' }],
    });
    const today = new Date().toISOString().slice(0, 10);
    const currentByCategory = new Map<TaxCategory, string>();
    for (const r of rows) {
      if (
        !currentByCategory.has(r.category) &&
        r.effectiveDate.toISOString().slice(0, 10) <= today
      ) {
        currentByCategory.set(r.category, r.id);
      }
    }
    return rows.map((r) => ({
      id: r.id,
      corporationId: r.corporationId,
      effectiveDate: r.effectiveDate.toISOString().slice(0, 10),
      category: r.category,
      rate: r.rate,
      priceIncludesTax: r.priceIncludesTax,
      rounding: r.rounding,
      isCurrent: currentByCategory.get(r.category) === r.id,
    }));
  }

  async create(
    principal: Principal,
    corporationId: string,
    dto: UpsertTaxSettingDto,
  ) {
    await this.assertCorporation(principal, corporationId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const exists = await this.prisma.taxSetting.findUnique({
      where: {
        corporationId_category_effectiveDate: {
          corporationId,
          category: dto.category,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (exists) {
      throw new BadRequestException(
        '同じ区分・適用開始日の税設定が既に登録されています',
      );
    }
    await this.prisma.taxSetting.create({
      data: {
        corporationId,
        effectiveDate: new Date(dto.effectiveDate),
        category: dto.category,
        rate: dto.rate,
        priceIncludesTax: dto.priceIncludesTax,
        rounding: dto.rounding,
        createdBy: staffId,
        updatedBy: staffId,
      },
    });
    return this.list(principal, corporationId);
  }

  async update(
    principal: Principal,
    corporationId: string,
    id: string,
    dto: UpsertTaxSettingDto,
  ) {
    await this.assertCorporation(principal, corporationId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const row = await this.prisma.taxSetting.findUnique({ where: { id } });
    if (!row || row.corporationId !== corporationId) {
      throw new NotFoundException('税設定が見つかりません');
    }
    const dupe = await this.prisma.taxSetting.findUnique({
      where: {
        corporationId_category_effectiveDate: {
          corporationId,
          category: dto.category,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (dupe && dupe.id !== id) {
      throw new BadRequestException(
        '同じ区分・適用開始日の税設定が既に登録されています',
      );
    }
    await this.prisma.taxSetting.update({
      where: { id },
      data: {
        effectiveDate: new Date(dto.effectiveDate),
        category: dto.category,
        rate: dto.rate,
        priceIncludesTax: dto.priceIncludesTax,
        rounding: dto.rounding,
        updatedBy: staffId,
      },
    });
    return this.list(principal, corporationId);
  }

  async remove(principal: Principal, corporationId: string, id: string) {
    await this.assertCorporation(principal, corporationId);
    const row = await this.prisma.taxSetting.findUnique({ where: { id } });
    if (!row || row.corporationId !== corporationId) {
      throw new NotFoundException('税設定が見つかりません');
    }
    await this.prisma.taxSetting.delete({ where: { id } });
    return this.list(principal, corporationId);
  }
}
