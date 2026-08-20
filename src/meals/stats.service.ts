import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { computeAccessScope } from '../auth/access-scope';
import { getPermissionsForPrincipal } from '../auth/permissions';
import { Principal } from '../auth/principal.types';
import { resolveFacilityIds } from '../common/facility-scope';
import { BillingService } from './billing.service';
import { MealReservationService } from './meal-reservation.service';
import { SchedulesService } from '../schedules/schedules.service';
import { HealthRecordsService } from '../health-records/health-records.service';
import { pad, jstNow } from '../common/date';

@Injectable()
export class StatsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly mealReservation: MealReservationService,
    private readonly schedules: SchedulesService,
    private readonly healthRecords: HealthRecordsService,
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

  /**
   * サイドバー/ダッシュボードの通知バッジ件数を1回で返す（従来は4エンドポイントを個別ポーリングしていたのを集約）。
   * 各件数は権限を持つ場合のみ算出（持たなければ0）。予定承認待ち・食事承認待ち・健康未入力は既存サービスへ委譲し、
   * ロジックの二重化を避ける。
   */
  async badges(principal: Principal) {
    const perms = getPermissionsForPrincipal(principal);
    const facilityIds = await this.accessibleFacilityIds(principal);
    const jst = jstNow();
    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const todayStr = `${year}-${pad(month)}-${pad(jst.getDate())}`;

    // 未入金・未発行は「締め済みの月」だけを対象にする（当月は集計中でノイズになるため）。
    // 直近12ヶ月の締め済み(facility,year,month)に属する請求レコードを数える。
    let unpaid = 0;
    let unissued = 0;
    if (perms.has('billing.view')) {
      const cutoffYm = year * 12 + (month - 1) - 11; // 直近12ヶ月
      const cutoffYear = year - 1;
      const closings = await this.prisma.billingClosing.findMany({
        where: { facilityId: { in: facilityIds }, year: { gte: cutoffYear } },
        select: { facilityId: true, year: true, month: true },
      });
      const closedSet = new Set(
        closings
          .filter((c) => c.year * 12 + (c.month - 1) >= cutoffYm)
          .map((c) => `${c.facilityId}:${c.year}:${c.month}`),
      );
      if (closedSet.size > 0) {
        const records = await this.prisma.billingRecord.findMany({
          where: { facilityId: { in: facilityIds }, year: { gte: cutoffYear } },
          select: {
            facilityId: true,
            year: true,
            month: true,
            paymentDate: true,
            issuedDate: true,
          },
        });
        for (const r of records) {
          if (!closedSet.has(`${r.facilityId}:${r.year}:${r.month}`)) continue;
          if (!r.paymentDate) unpaid++;
          if (!r.issuedDate) unissued++;
        }
      }
    }

    let deliveryMissing = 0;
    if (perms.has('meal.delivery.manage')) {
      const today = new Date(todayStr);
      for (const fid of facilityIds) {
        // 発注数の数え方は納品画面(DeliveryService.monthly)と揃える。
        // キャンセル(cancelled)も食事は届くため対象に含める。
        const orders = await this.prisma.meal.count({
          where: {
            facilityId: fid,
            approvalStatus: 'approved',
            status: { in: ['reserved', 'eaten', 'cancelled'] },
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

    // 承認待ち・健康未入力は既存サービスの件数メソッドへ委譲（権限がある場合のみ）
    const pendingSchedule = perms.has('schedule.approve')
      ? (await this.schedules.pendingCount(principal)).count
      : 0;
    const pendingMeal = perms.has('meal.manage')
      ? (await this.mealReservation.pendingCount(principal)).count
      : 0;
    const healthMissing = perms.has('health.view')
      ? (await this.healthRecords.missingCount(principal)).count
      : 0;

    return {
      unpaid,
      unissued,
      deliveryMissing,
      pendingSchedule,
      pendingMeal,
      healthMissing,
    };
  }
}
