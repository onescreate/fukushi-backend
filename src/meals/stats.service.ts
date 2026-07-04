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
import { getPermissionsForPrincipal } from '../auth/permissions';
import { Principal } from '../auth/principal.types';
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
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗を閲覧する権限がありません');
    }

    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    const range = { gte: from, lte: to };

    // 通所
    const [planned, present, absent, late, earlyLeave] = await Promise.all([
      this.prisma.schedule.count({
        where: { facilityId, status: 'approved', planDate: range },
      }),
      this.prisma.attendance.count({
        where: { facilityId, workDate: range, clockIn: { not: null } },
      }),
      this.prisma.attendance.count({
        where: { facilityId, workDate: range, status: 'absent' },
      }),
      this.prisma.attendance.count({
        where: { facilityId, workDate: range, isLate: true },
      }),
      this.prisma.attendance.count({
        where: { facilityId, workDate: range, isEarlyLeave: true },
      }),
    ]);

    // 食事（承認済み）
    const mealBase = {
      facilityId,
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
}
