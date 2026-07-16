import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { ALL_FACILITIES, resolveFacilityIds } from '../common/facility-scope';

import { pad } from '../common/date';

@Injectable()
export class DeliveryService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFacility(principal: Principal, facilityId: string) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の納品を操作する権限がありません');
    }
    return facility;
  }

  /**
   * 店舗×年月の納品状況（日別）。
   * 発注数＝承認済みの予約(reserved/eaten)の食数、納品数＝手入力。
   */
  async monthly(
    principal: Principal,
    facilityId: string,
    year: number,
    month: number,
  ) {
    const facilityIds = await resolveFacilityIds(
      this.prisma,
      principal,
      facilityId,
    );
    const allMode = facilityId === ALL_FACILITIES;
    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);

    const meals = await this.prisma.meal.findMany({
      where: {
        facilityId: { in: facilityIds },
        approvalStatus: 'approved',
        status: { in: ['reserved', 'eaten'] },
        mealDate: { gte: from, lte: to },
      },
      select: { mealDate: true },
    });
    const orderByDate = new Map<string, number>();
    for (const m of meals) {
      const d = m.mealDate.toISOString().slice(0, 10);
      orderByDate.set(d, (orderByDate.get(d) ?? 0) + 1);
    }

    const deliveries = await this.prisma.mealDelivery.findMany({
      where: { facilityId: { in: facilityIds }, deliveryDate: { gte: from, lte: to } },
    });
    // 全店舗時は同一日に複数店舗の納品があり得るので合算する
    const delSumByDate = new Map<string, number>();
    const delNoteByDate = new Map<string, string | null>();
    for (const d of deliveries) {
      const key = d.deliveryDate.toISOString().slice(0, 10);
      delSumByDate.set(key, (delSumByDate.get(key) ?? 0) + d.deliveryCount);
      if (!allMode) delNoteByDate.set(key, d.note ?? null);
    }

    const dates = new Set<string>([
      ...orderByDate.keys(),
      ...delSumByDate.keys(),
    ]);
    const days: Record<
      string,
      { orderCount: number; deliveryCount: number | null; note: string | null }
    > = {};
    const unentered: string[] = [];
    const mismatch: { date: string; orderCount: number; deliveryCount: number }[] = [];

    for (const date of dates) {
      const orderCount = orderByDate.get(date) ?? 0;
      const deliveryCount = delSumByDate.has(date)
        ? (delSumByDate.get(date) ?? 0)
        : null;
      days[date] = { orderCount, deliveryCount, note: delNoteByDate.get(date) ?? null };
      if (orderCount > 0 && deliveryCount === null) unentered.push(date);
      if (deliveryCount !== null && deliveryCount !== orderCount) {
        mismatch.push({ date, orderCount, deliveryCount });
      }
    }
    unentered.sort();
    mismatch.sort((a, b) => a.date.localeCompare(b.date));

    return { year, month, allMode, days, unentered, mismatch };
  }

  /** 納品数・備考を設定（店舗×日）。 */
  async setDelivery(
    principal: Principal,
    facilityId: string,
    date: string,
    deliveryCount: number,
    note: string | null,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    await this.prisma.mealDelivery.upsert({
      where: {
        facilityId_deliveryDate: { facilityId, deliveryDate: new Date(date) },
      },
      create: {
        corporationId: facility.corporationId,
        facilityId,
        deliveryDate: new Date(date),
        deliveryCount,
        note,
        createdBy: principal.id,
        updatedBy: principal.id,
      },
      update: { deliveryCount, note, updatedBy: principal.id },
    });
    return { ok: true };
  }
}
