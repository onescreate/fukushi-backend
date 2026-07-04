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
import { UpsertInvoiceSettingDto } from './dto/invoice-setting.dto';

@Injectable()
export class InvoiceSettingService {
  constructor(private readonly prisma: PrismaService) {}

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
