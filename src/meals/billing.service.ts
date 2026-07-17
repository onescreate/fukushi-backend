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
import { ALL_FACILITIES, resolveFacilityIds } from '../common/facility-scope';
import { computeTax } from './tax-util';
import { parseBillingSnapshot } from './billing-snapshot';
import { pad } from '../common/date';


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

  /**
   * 利用者本人の請求書一覧（確定＝月締め済みの食事代のみ）。
   * closedSnapshot が保存されている月＝請求確定月。新しい月から並べる。
   */
  async myBilling(userId: string) {
    const records = await this.prisma.billingRecord.findMany({
      where: { userId },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });
    return records
      .map((r) => {
        const snap = parseBillingSnapshot(r.closedSnapshot);
        if (!snap) return null; // 未締め（スナップショット無し）＝請求書はまだ発行されていない
        return {
          year: r.year,
          month: r.month,
          mealCount: snap.mealCount,
          mealTotal: snap.mealTotal,
          cancelCount: snap.cancelCount,
          cancelTotal: snap.cancelTotal,
          subtotal: snap.subtotal,
          taxAmount: snap.taxAmount,
          total: snap.total,
          taxRate: snap.taxRate,
          paid: !!r.paymentDate,
          paymentDate: r.paymentDate
            ? r.paymentDate.toISOString().slice(0, 10)
            : null,
        };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
  }

  /** 対象年月・法人の消費税設定（軽減税率・その月末時点で有効な履歴）。 */
  private async taxForMonth(
    corporationId: string,
    year: number,
    month: number,
  ) {
    const lastDay = new Date(year, month, 0).getDate();
    const monthEnd = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    // 現状の請求対象は「食事代（食品=軽減8%・内税）」と「キャンセル料（非課税）」のみ。
    // よってここでは軽減(reduced)の税設定を採用する（税率/内税/端数は設定値を使用）。
    // ※将来、標準10%の課税品目（食事以外の物販・役務）を扱う場合は、
    //   請求明細を品目化して「品目ごとの税区分(standard/reduced)」で集計する拡張が必要。
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
   * 承認済み meal を利用者ごとに集計（金額のみ・入金/メモ除く）。
   * 食事料金＝reserved/eaten、キャンセル料＝cancelled。消費税は食事料金(内税)のみ対象。
   */
  private async aggregate(
    corporationId: string,
    facilityId: string,
    year: number,
    month: number,
  ) {
    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);

    const meals = await this.prisma.meal.findMany({
      where: { facilityId, approvalStatus: 'approved', mealDate: { gte: from, lte: to } },
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

    const tax = await this.taxForMonth(corporationId, year, month);
    return [...byUser.entries()]
      // 無料取消(revoked)のみで請求額のない利用者は一覧から除外
      .filter(([, a]) => a.mealCount > 0 || a.cancelCount > 0)
      .map(([userId, a]) => {
        const total = a.mealTotal + a.cancelTotal;
        // 消費税は食事料金(内税)のみ対象。キャンセル料は不課税。
        const taxAmount = tax
          ? computeTax(a.mealTotal, tax.rate, tax.priceIncludesTax, tax.rounding)
          : 0;
        return {
          userId,
          userName: a.userName,
          mealCount: a.mealCount,
          mealTotal: a.mealTotal,
          cancelCount: a.cancelCount,
          cancelTotal: a.cancelTotal,
          total,
          taxAmount,
          subtotal: a.mealTotal - taxAmount,
          taxRate: tax?.rate ?? null,
        };
      });
  }

  private closingKey(facilityId: string, year: number, month: number) {
    return { facilityId_year_month: { facilityId, year, month } };
  }

  /**
   * 店舗×年月の食事請求一覧。締め済みなら確定額（スナップショット）、未締めならライブ集計。
   * 入金状況・メモは billing_records から付与する。
   */
  async list(
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
    const facilities = await this.prisma.facility.findMany({
      where: { id: { in: facilityIds } },
      select: { id: true, name: true, corporationId: true },
    });

    // 対象店舗の締め状況をまとめて取得（全店舗ビューでも店舗ごとに判定する）。
    const closings = await this.prisma.billingClosing.findMany({
      where: { facilityId: { in: facilityIds }, year, month },
    });
    const closingByFacility = new Map(
      closings.map((c) => [c.facilityId, c] as const),
    );

    const records = await this.prisma.billingRecord.findMany({
      where: { facilityId: { in: facilityIds }, year, month },
    });
    const recByUser = new Map(records.map((r) => [r.userId, r]));

    type AmountRow = Awaited<ReturnType<BillingService['aggregate']>>[number] & {
      facilityName?: string | null;
    };
    // 店舗ごとに: 締め済み→確定スナップショット / 未締め→ライブ集計。
    // これにより全店舗ビューでも締め済み月は確定額で表示され、単店舗ビューと一致する。
    const baseRows: AmountRow[] = [];
    for (const f of facilities) {
      if (closingByFacility.has(f.id)) {
        const snaps = records
          .filter((r) => r.facilityId === f.id)
          .map((r) => parseBillingSnapshot(r.closedSnapshot))
          .filter((r): r is AmountRow => r !== null)
          .map((r) => (allMode ? { ...r, facilityName: f.name } : r));
        baseRows.push(...snaps);
      } else {
        const fr = await this.aggregate(f.corporationId, f.id, year, month);
        baseRows.push(
          ...fr.map((r) => (allMode ? { ...r, facilityName: f.name } : r)),
        );
      }
    }

    const rows = baseRows.map((a) => {
      const rec = recByUser.get(a.userId);
      return {
        ...a,
        facilityName: a.facilityName ?? null,
        paymentDate: rec?.paymentDate
          ? rec.paymentDate.toISOString().slice(0, 10)
          : null,
        note: rec?.note ?? null,
      };
    });
    rows.sort((x, y) => x.userName.localeCompare(y.userName, 'ja'));
    // 単店舗: その店舗が締め済みか。全店舗: 表示中の全店舗が締め済みなら closed とみなす。
    const closed = allMode
      ? facilities.length > 0 &&
        facilities.every((f) => closingByFacility.has(f.id))
      : closingByFacility.has(facilityId);
    const closedAt = allMode
      ? null
      : (closingByFacility.get(facilityId)?.closedAt.toISOString() ?? null);
    return {
      year,
      month,
      taxRate: rows[0]?.taxRate ?? null,
      closed,
      closedAt,
      allMode,
      rows,
    };
  }

  /** 月締め: 確定額をスナップショットし、その月の食事編集をロックする。 */
  async close(
    principal: Principal,
    facilityId: string,
    year: number,
    month: number,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    const rows = await this.aggregate(
      facility.corporationId,
      facilityId,
      year,
      month,
    );
    const staffId = principal.type === 'staff' ? principal.id : null;
    // 「全利用者のスナップショット保存」と「締めロック」を1つのトランザクションで原子的に実行する。
    // 途中で失敗しても“一部だけ締まった”状態を残さない（金額整合を守る）。
    await this.prisma.$transaction(async (tx) => {
      for (const r of rows) {
        await tx.billingRecord.upsert({
          where: { userId_year_month: { userId: r.userId, year, month } },
          create: {
            corporationId: facility.corporationId,
            facilityId,
            userId: r.userId,
            year,
            month,
            closedSnapshot: r,
            createdBy: staffId,
            updatedBy: staffId,
          },
          update: { closedSnapshot: r, updatedBy: staffId },
        });
      }
      await tx.billingClosing.upsert({
        where: this.closingKey(facilityId, year, month),
        create: {
          corporationId: facility.corporationId,
          facilityId,
          year,
          month,
          closedBy: staffId,
        },
        update: { closedBy: staffId, closedAt: new Date() },
      });
    });
    return { ok: true };
  }

  /** 月の締めを解除（再開）。食事編集が再び可能になる。 */
  async reopen(
    principal: Principal,
    facilityId: string,
    year: number,
    month: number,
  ) {
    await this.assertFacility(principal, facilityId);
    await this.prisma.billingClosing.deleteMany({
      where: { facilityId, year, month },
    });
    return { ok: true };
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
