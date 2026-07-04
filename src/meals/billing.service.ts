import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { computeTax } from './tax-util';

const pad = (n: number) => String(n).padStart(2, '0');

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFacility(principal: Principal, facilityId: string) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の請求を操作する権限がありません');
    }
    return facility;
  }

  private async userInScope(scope: AccessScope, userId: string) {
    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { id: true, corporationId: true, facilityId: true },
      })
      .catch(() => null);
    if (!user) throw new NotFoundException('利用者が見つかりません');
    if (
      !canAccessFacility(scope, {
        id: user.facilityId,
        corporationId: user.corporationId,
      })
    ) {
      throw new ForbiddenException('この利用者を操作する権限がありません');
    }
    return user;
  }

  /** 対象年月・法人の消費税設定（軽減税率・その月末時点で有効な履歴）。 */
  private async taxForMonth(
    corporationId: string,
    year: number,
    month: number,
  ) {
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    return this.prisma.taxSetting.findFirst({
      where: {
        corporationId,
        category: 'reduced',
        effectiveDate: { lte: monthEnd },
      },
      orderBy: { effectiveDate: 'desc' },
    });
  }

  /**
   * 店舗×年月の食事請求一覧（利用者ごと）。
   * 金額は承認済み meal を集計（食事料金＝reserved/eaten、キャンセル料＝cancelled）。
   * 消費税は内税前提で総額から逆算した内訳を返す。入金状況は billing_records から。
   */
  async list(
    principal: Principal,
    facilityId: string,
    year: number,
    month: number,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);

    const meals = await this.prisma.meal.findMany({
      where: {
        facilityId,
        approvalStatus: 'approved',
        mealDate: { gte: from, lte: to },
      },
      include: { user: { select: { lastName: true, firstName: true } } },
    });

    type Agg = {
      userName: string;
      mealCount: number;
      mealTotal: number;
      cancelCount: number;
      cancelTotal: number;
    };
    const byUser = new Map<string, Agg>();
    for (const m of meals) {
      const a =
        byUser.get(m.userId) ??
        {
          userName: `${m.user.lastName} ${m.user.firstName}`,
          mealCount: 0,
          mealTotal: 0,
          cancelCount: 0,
          cancelTotal: 0,
        };
      if (m.status === 'reserved' || m.status === 'eaten') {
        a.mealTotal += m.amount;
        a.mealCount += 1;
      } else if (m.status === 'cancelled') {
        a.cancelTotal += m.amount;
        a.cancelCount += 1;
      }
      byUser.set(m.userId, a);
    }

    const tax = await this.taxForMonth(facility.corporationId, year, month);
    const records = await this.prisma.billingRecord.findMany({
      where: { facilityId, year, month },
    });
    const recByUser = new Map(records.map((r) => [r.userId, r]));

    const rows = [...byUser.entries()]
      // 無料取消(revoked)のみで請求額のない利用者は一覧から除外
      .filter(([, a]) => a.mealCount > 0 || a.cancelCount > 0)
      .map(([userId, a]) => {
      const total = a.mealTotal + a.cancelTotal;
      // 消費税は食事料金(mealTotal・内税)のみが対象。キャンセル料は不課税（税抜扱い）。
      const taxAmount = tax
        ? computeTax(a.mealTotal, tax.rate, tax.priceIncludesTax, tax.rounding)
        : 0;
      const rec = recByUser.get(userId);
      return {
        userId,
        userName: a.userName,
        mealCount: a.mealCount,
        mealTotal: a.mealTotal, // 食事料金（税込・8%対象）
        cancelCount: a.cancelCount,
        cancelTotal: a.cancelTotal, // キャンセル料（不課税）
        total, // 総額
        taxAmount, // 消費税（食事のみ）
        subtotal: a.mealTotal - taxAmount, // 8%対象の税抜
        taxRate: tax?.rate ?? null,
        paymentDate: rec?.paymentDate
          ? rec.paymentDate.toISOString().slice(0, 10)
          : null,
        note: rec?.note ?? null,
      };
    });
    rows.sort((x, y) => x.userName.localeCompare(y.userName, 'ja'));
    return { year, month, taxRate: tax?.rate ?? null, rows };
  }

  /** 利用者×年月の食事明細（日別）。請求の内訳表示に使う。 */
  async detail(
    principal: Principal,
    userId: string,
    year: number,
    month: number,
  ) {
    const scope = computeAccessScope(principal);
    await this.userInScope(scope, userId);
    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    const meals = await this.prisma.meal.findMany({
      where: {
        userId,
        approvalStatus: 'approved',
        mealDate: { gte: from, lte: to },
        status: { in: ['reserved', 'eaten', 'cancelled'] },
      },
      orderBy: { mealDate: 'asc' },
    });
    return meals.map((m) => ({
      mealDate: m.mealDate.toISOString().slice(0, 10),
      status: m.status,
      amount: m.amount,
    }));
  }

  private async upsertRecord(
    principal: Principal,
    userId: string,
    year: number,
    month: number,
    data: { paymentDate?: Date | null; note?: string | null },
  ) {
    const scope = computeAccessScope(principal);
    const user = await this.userInScope(scope, userId);
    await this.prisma.billingRecord.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId,
        year,
        month,
        ...data,
        createdBy: principal.id,
        updatedBy: principal.id,
      },
      update: { ...data, updatedBy: principal.id },
    });
    return { ok: true };
  }

  /** 入金日を設定/解除（null=未入金に戻す）。 */
  setPayment(
    principal: Principal,
    userId: string,
    year: number,
    month: number,
    paymentDate: string | null,
  ) {
    return this.upsertRecord(principal, userId, year, month, {
      paymentDate: paymentDate ? new Date(paymentDate) : null,
    });
  }

  /** 請求メモを設定。 */
  setNote(
    principal: Principal,
    userId: string,
    year: number,
    month: number,
    note: string,
  ) {
    return this.upsertRecord(principal, userId, year, month, {
      note: note || null,
    });
  }
}
