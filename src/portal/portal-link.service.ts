import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ServiceType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PortalService } from './portal.service';

export interface DesignateShopInput {
  serviceType?: ServiceType | null;
  mealsEnabled?: boolean;
}

/**
 * ポータル店舗を「福祉事業所」として指定・解除するサービス。
 * 店舗の名前・法人はポータルを常に参照（単一マスタ）。福祉固有項目のみ福祉側で保持。
 */
@Injectable()
export class PortalLinkService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
  ) {}

  /** ポータル店舗一覧＋福祉事業所としての指定状況。 */
  async listShops() {
    if (!this.portal.enabled) {
      return { enabled: false, shops: [] as unknown[] };
    }
    const [shops, corps, facilities] = await Promise.all([
      this.portal.getShops(),
      this.portal.getCorps(),
      this.prisma.facility.findMany({
        where: { externalShopId: { not: null } },
        select: {
          id: true,
          externalShopId: true,
          serviceType: true,
          mealsEnabled: true,
          status: true,
        },
      }),
    ]);
    const corpName = new Map(corps.map((c) => [c.id, c.name]));
    const facByShop = new Map(facilities.map((f) => [f.externalShopId as string, f]));
    return {
      enabled: true,
      shops: shops.map((s) => {
        const f = facByShop.get(s.id);
        return {
          shopId: s.id,
          name: s.name,
          corpId: s.corpId,
          corpName: s.corpId ? (corpName.get(s.corpId) ?? null) : null,
          businessCategory: s.businessCategory,
          status: s.status,
          designated: !!f && f.status === 'active',
          facilityId: f?.id ?? null,
          serviceType: f?.serviceType ?? null,
          mealsEnabled: f?.mealsEnabled ?? false,
        };
      }),
    };
  }

  /** 店舗を福祉事業所として指定（法人も自動でひも付け）。 */
  async designate(shopId: string, input: DesignateShopInput) {
    if (!this.portal.enabled) {
      throw new BadRequestException('ポータル連携が無効です');
    }
    const shops = await this.portal.getShops();
    const shop = shops.find((s) => s.id === shopId);
    if (!shop) throw new NotFoundException('店舗が見つかりません');
    if (!shop.corpId) {
      throw new BadRequestException('この店舗には法人(corp)が設定されていません');
    }

    // 法人を upsert（ポータルの corp_id を単一キーに）
    const corps = await this.portal.getCorps();
    const corpName = corps.find((c) => c.id === shop.corpId)?.name ?? '(法人)';
    const corp = await this.prisma.corporation.upsert({
      where: { externalCorpId: shop.corpId },
      create: { externalCorpId: shop.corpId, name: corpName, status: 'active' },
      update: { name: corpName },
    });

    // 施設を upsert（ポータルの shop_id を単一キーに）
    const facility = await this.prisma.facility.upsert({
      where: { externalShopId: shopId },
      create: {
        externalShopId: shopId,
        corporationId: corp.id,
        name: shop.name,
        serviceType: input.serviceType ?? null,
        mealsEnabled: input.mealsEnabled ?? false,
        status: 'active',
      },
      update: {
        corporationId: corp.id,
        name: shop.name,
        serviceType: input.serviceType ?? null,
        mealsEnabled: input.mealsEnabled ?? false,
        status: 'active',
      },
    });
    return { ok: true, facilityId: facility.id };
  }

  /** 福祉事業所の指定を解除（データは残し無効化）。 */
  async undesignate(shopId: string) {
    const f = await this.prisma.facility.findUnique({
      where: { externalShopId: shopId },
    });
    if (f) {
      await this.prisma.facility.update({
        where: { id: f.id },
        data: { status: 'inactive' },
      });
    }
    return { ok: true };
  }
}
