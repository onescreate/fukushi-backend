import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InvoiceSetting } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import {
  UpsertInvoiceSettingDto,
  SaveInvoiceConfigDto,
} from './dto/invoice-setting.dto';
import { PortalService, PortalAccount } from '../portal/portal.service';

@Injectable()
export class InvoiceSettingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly portal: PortalService,
  ) {}

  /** 口座を「銀行 支店 種別 番号 名義」の1行に整形。 */
  private formatBank(a: PortalAccount): string {
    return [a.bankName, a.branch, a.type, a.number, a.holder]
      .filter((v) => v && String(v).trim())
      .join(' ');
  }

  /** 事業所→法人→ポータルの発行者情報＋振込先＋社印を解決（上書きがあれば優先）。 */
  async resolveIssuer(principal: Principal, facilityId: string, date: string) {
    const facility = await this.assertFacility(principal, facilityId);
    const [config, corp] = await Promise.all([
      this.prisma.facilityInvoiceConfig.findUnique({ where: { facilityId } }),
      this.prisma.corporation.findUnique({
        where: { id: facility.corporationId },
        select: {
          externalCorpId: true,
          name: true,
          postalCode: true,
          addressLine: true,
          phone: true,
        },
      }),
    ]);
    const extCorpId = corp?.externalCorpId ?? null;

    let portalCorp = null as Awaited<
      ReturnType<PortalService['getCorpById']>
    >;
    let seal: string | null = null;
    let accounts: PortalAccount[] = [];
    if (this.portal.enabled && extCorpId) {
      [portalCorp, seal, accounts] = await Promise.all([
        this.portal.getCorpById(extCorpId),
        this.portal.getCorpSeal(extCorpId),
        this.portal.getAccountsByCorp(extCorpId),
      ]);
    }

    // ポータルに法人が無ければ、旧「請求書設定」を後方互換のフォールバックに使う。
    const legacy = portalCorp
      ? null
      : await this.prisma.invoiceSetting.findFirst({
          where: { facilityId, effectiveDate: { lte: new Date(date) } },
          orderBy: { effectiveDate: 'desc' },
        });

    // 振込先：上書き＞選択口座＞旧設定。
    let bankInfo = config?.bankInfoOverride ?? null;
    if (!bankInfo && config?.bankAccountId) {
      const acc = accounts.find((a) => a.id === config.bankAccountId);
      if (acc) bankInfo = this.formatBank(acc);
    }
    if (!bankInfo) bankInfo = legacy?.bankInfo ?? null;

    return {
      issuerName:
        config?.issuerNameOverride ??
        portalCorp?.name ??
        legacy?.issuerName ??
        corp?.name ??
        null,
      registrationNumber:
        config?.registrationNumberOverride ??
        portalCorp?.invoiceNum ??
        legacy?.registrationNumber ??
        null,
      postalCode:
        config?.postalCodeOverride ??
        portalCorp?.postalCode ??
        legacy?.postalCode ??
        corp?.postalCode ??
        null,
      address:
        config?.addressOverride ??
        portalCorp?.address ??
        legacy?.address ??
        corp?.addressLine ??
        null,
      phone:
        config?.phoneOverride ??
        portalCorp?.tel ??
        legacy?.phone ??
        corp?.phone ??
        null,
      bankInfo,
      sealImage: config?.sealEnabled === false ? null : seal,
      remark: config?.remark ?? null,
      source: portalCorp ? 'portal' : legacy ? 'legacy' : 'none',
    };
  }

  /** 事業所の請求書設定（口座選択・社印・上書き）。無ければ既定値。 */
  async getConfig(principal: Principal, facilityId: string) {
    await this.assertFacility(principal, facilityId);
    const c = await this.prisma.facilityInvoiceConfig.findUnique({
      where: { facilityId },
    });
    return {
      facilityId,
      bankAccountId: c?.bankAccountId ?? null,
      sealEnabled: c?.sealEnabled ?? true,
      issuerNameOverride: c?.issuerNameOverride ?? null,
      registrationNumberOverride: c?.registrationNumberOverride ?? null,
      postalCodeOverride: c?.postalCodeOverride ?? null,
      addressOverride: c?.addressOverride ?? null,
      phoneOverride: c?.phoneOverride ?? null,
      bankInfoOverride: c?.bankInfoOverride ?? null,
      remark: c?.remark ?? null,
    };
  }

  /** 事業所の請求書設定を保存（1店舗1件・upsert）。 */
  async saveConfig(
    principal: Principal,
    facilityId: string,
    dto: SaveInvoiceConfigDto,
  ) {
    await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const data = {
      bankAccountId: dto.bankAccountId ?? null,
      sealEnabled: dto.sealEnabled ?? true,
      issuerNameOverride: dto.issuerNameOverride || null,
      registrationNumberOverride: dto.registrationNumberOverride || null,
      postalCodeOverride: dto.postalCodeOverride || null,
      addressOverride: dto.addressOverride || null,
      phoneOverride: dto.phoneOverride || null,
      bankInfoOverride: dto.bankInfoOverride || null,
      remark: dto.remark || null,
    };
    await this.prisma.facilityInvoiceConfig.upsert({
      where: { facilityId },
      create: { facilityId, ...data, createdBy: staffId, updatedBy: staffId },
      update: { ...data, updatedBy: staffId },
    });
    return { ok: true };
  }

  /** 振込先選択用：この事業所の法人に紐づくポータル口座一覧。 */
  async corpAccounts(principal: Principal, facilityId: string) {
    const facility = await this.assertFacility(principal, facilityId);
    const corp = await this.prisma.corporation.findUnique({
      where: { id: facility.corporationId },
      select: { externalCorpId: true },
    });
    if (!this.portal.enabled || !corp?.externalCorpId) {
      return { enabled: this.portal.enabled, accounts: [] };
    }
    const accounts = await this.portal.getAccountsByCorp(corp.externalCorpId);
    return {
      enabled: true,
      accounts: accounts.map((a) => ({
        id: a.id,
        label: this.formatBank(a),
        name: a.name,
      })),
    };
  }

  private async assertFacility(principal: Principal, facilityId: string) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の請求書情報を操作する権限がありません');
    }
    return facility;
  }

  private serialize(s: InvoiceSetting, isCurrent = false) {
    return {
      id: s.id,
      facilityId: s.facilityId,
      effectiveDate: s.effectiveDate.toISOString().slice(0, 10),
      issuerName: s.issuerName,
      registrationNumber: s.registrationNumber,
      postalCode: s.postalCode,
      address: s.address,
      phone: s.phone,
      bankInfo: s.bankInfo,
      isCurrent,
    };
  }

  async list(principal: Principal, facilityId: string) {
    await this.assertFacility(principal, facilityId);
    const rows = await this.prisma.invoiceSetting.findMany({
      where: { facilityId },
      orderBy: { effectiveDate: 'desc' },
    });
    const today = new Date().toISOString().slice(0, 10);
    const currentId = rows.find(
      (r) => r.effectiveDate.toISOString().slice(0, 10) <= today,
    )?.id;
    return rows.map((r) => this.serialize(r, r.id === currentId));
  }

  /** 指定日に有効な発行者情報（請求書描画用）。無ければ null。 */
  async active(principal: Principal, facilityId: string, date: string) {
    await this.assertFacility(principal, facilityId);
    const row = await this.prisma.invoiceSetting.findFirst({
      where: { facilityId, effectiveDate: { lte: new Date(date) } },
      orderBy: { effectiveDate: 'desc' },
    });
    return row ? this.serialize(row, true) : null;
  }

  async create(
    principal: Principal,
    facilityId: string,
    dto: UpsertInvoiceSettingDto,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const exists = await this.prisma.invoiceSetting.findUnique({
      where: {
        facilityId_effectiveDate: {
          facilityId,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (exists) {
      throw new BadRequestException('同じ適用開始日の設定が既に登録されています');
    }
    await this.prisma.invoiceSetting.create({
      data: {
        corporationId: facility.corporationId,
        facilityId,
        effectiveDate: new Date(dto.effectiveDate),
        issuerName: dto.issuerName,
        registrationNumber: dto.registrationNumber,
        postalCode: dto.postalCode,
        address: dto.address,
        phone: dto.phone,
        bankInfo: dto.bankInfo,
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
    dto: UpsertInvoiceSettingDto,
  ) {
    await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const row = await this.prisma.invoiceSetting.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('設定が見つかりません');
    }
    const dupe = await this.prisma.invoiceSetting.findUnique({
      where: {
        facilityId_effectiveDate: {
          facilityId,
          effectiveDate: new Date(dto.effectiveDate),
        },
      },
    });
    if (dupe && dupe.id !== id) {
      throw new BadRequestException('同じ適用開始日の設定が既に登録されています');
    }
    await this.prisma.invoiceSetting.update({
      where: { id },
      data: {
        effectiveDate: new Date(dto.effectiveDate),
        issuerName: dto.issuerName,
        registrationNumber: dto.registrationNumber,
        postalCode: dto.postalCode,
        address: dto.address,
        phone: dto.phone,
        bankInfo: dto.bankInfo,
        updatedBy: staffId,
      },
    });
    return this.list(principal, facilityId);
  }

  async remove(principal: Principal, facilityId: string, id: string) {
    await this.assertFacility(principal, facilityId);
    const row = await this.prisma.invoiceSetting.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('設定が見つかりません');
    }
    await this.prisma.invoiceSetting.delete({ where: { id } });
    return this.list(principal, facilityId);
  }
}
