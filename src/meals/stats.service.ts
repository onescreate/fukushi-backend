import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeAccessScope } from '../auth/access-scope';
import { getPermissionsForPrincipal } from '../auth/permissions';
import { Principal } from '../auth/principal.types';
import { resolveFacilityIds } from '../common/facility-scope';
import { BillingService } from './billing.service';

const pad = (n: number) => String(n).padStart(2, '0');

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  /** 店舗×年月のダッシュボード集計（通所・食事・請求）。 */
  async facilitySummary(
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
    const facFilter = { in: facilityIds };

    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    const range = { gte: from, lte: to };

    // 通所
    const [planned, present, absent, late, earlyLeave] = await Promise.all([
      this.prisma.schedule.count({
        where: { facilityId: facFilter, status: 'approved', planDate: range },
      }),
      this.prisma.attendance.count({
        where: { facilityId: facFilter, workDate: range, clockIn: { not: null } },
      }),
      this.prisma.attendance.count({
        where: { facilityId: facFilter, workDate: range, status: 'absent' },
      }),
      this.prisma.attendance.count({
        where: { facilityId: facFilter, workDate: range, isLate: true },
      }),
      this.prisma.attendance.count({
        where: { facilityId: facFilter, workDate: range, isEarlyLeave: true },
      }),
    ]);

    // 食事（承認済み）
    const mealBase = {
      facilityId: facFilter,
      approvalStatus: 'approved' as const,
      mealDate: range,
    };
    const [reserved, eaten, cancelled] = await Promise.all([
      this.prisma.meal.count({ where: { ...mealBase, status: 'reserved' } }),
      this.prisma.meal.count({ where: { ...mealBase, status: 'eaten' } }),
      this.prisma.meal.count({ where: { ...mealBase, status: 'cancelled' } }),
    ]);

    // 請求（billing.view を持つ場合のみ）
    let billing: {
      total: number;
      paidAmount: number;
      paidCount: number;
      unpaidAmount: number;
      unpaidCount: number;
      closed: boolean;
    } | null = null;
    if (getPermissionsForPrincipal(principal).has('billing.view')) {
      const b = await this.billing.list(principal, facilityId, year, month);
      const paid = b.rows.filter((r) => r.paymentDate);
      const unpaid = b.rows.filter((r) => !r.paymentDate);
      billing = {
        total: b.rows.reduce((s, r) => s + r.total, 0),
        paidAmount: paid.reduce((s, r) => s + r.total, 0),
        paidCount: paid.length,
        unpaidAmount: unpaid.reduce((s, r) => s + r.total, 0),
        unpaidCount: unpaid.length,
        closed: b.closed,
      };
    }

    return {
      year,
      month,
      attendance: {
        planned,
        present,
        absent,
        late,
        earlyLeave,
        rate: planned > 0 ? Math.round((present / planned) * 100) : null,
      },
      meals: { reserved, eaten, cancelled, ordered: reserved + eaten },
      billing,
    };
  }

  /** principal がアクセスできる店舗IDの一覧。 */
  private async accessibleFacilityIds(principal: Principal): Promise<string[]> {
    const scope = computeAccessScope(principal);
    if (scope.crossTenant) {
      const fs = await this.prisma.facility.findMany({ select: { id: true } });
      return fs.map((f) => f.id);
    }
    if (scope.allFacilitiesInCorporation) {
      const fs = await this.prisma.facility.findMany({
        where: { corporationId: scope.corporationId ?? '__none__' },
        select: { id: true },
      });
      return fs.map((f) => f.id);
    }
    return scope.facilityIds;
  }

  /** サイドバー通知バッジ用の件数（未入金・当日の納品未登録）。 */
  async badges(principal: Principal) {
    const perms = getPermissionsForPrincipal(principal);
    const facilityIds = await this.accessibleFacilityIds(principal);
    const jst = new Date(
      new Date().toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }),
    );
    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const todayStr = `${year}-${pad(month)}-${pad(jst.getDate())}`;

    let unpaid = 0;
    if (perms.has('billing.view')) {
      for (const fid of facilityIds) {
        const b = await this.billing.list(principal, fid, year, month);
        unpaid += b.rows.filter((r) => !r.paymentDate).length;
      }
    }

    let deliveryMissing = 0;
    if (perms.has('meal.delivery.manage')) {
      const today = new Date(todayStr);
      for (const fid of facilityIds) {
        const orders = await this.prisma.meal.count({
          where: {
            facilityId: fid,
            approvalStatus: 'approved',
            status: { in: ['reserved', 'eaten'] },
            mealDate: today,
          },
        });
        if (orders > 0) {
          const del = await this.prisma.mealDelivery.findUnique({
            where: {
              facilityId_deliveryDate: { facilityId: fid, deliveryDate: today },
            },
          });
          if (!del) deliveryMissing++;
        }
      }
    }

    return { unpaid, deliveryMissing };
  }
}
