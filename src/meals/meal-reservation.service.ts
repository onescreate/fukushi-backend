import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MealStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { classifyMealWindow } from './meal-rules';
import { MySubmitMealDto } from './dto/my-submit-meal.dto';
import { AdminMealDto } from './dto/admin-meal.dto';

type UserForFee = {
  id: string;
  corporationId: string;
  facilityId: string;
  useSpecialMealFee: boolean;
};

@Injectable()
export class MealReservationService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 共通ヘルパ ----------

  private async userInScope(scope: AccessScope, userId: string) {
    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: {
          id: true,
          corporationId: true,
          facilityId: true,
          useSpecialMealFee: true,
        },
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

  /** 店舗の食事設定（食事提供フラグ・締切日数）を取得。 */
  private async facilityMealInfo(facilityId: string) {
    const f = await this.prisma.facility.findUnique({
      where: { id: facilityId },
      select: { mealsEnabled: true, mealChangeDeadlineDays: true },
    });
    return {
      mealsEnabled: f?.mealsEnabled ?? false,
      deadlineDays: f?.mealChangeDeadlineDays ?? 14,
    };
  }

  /**
   * 利用者×利用日の食事料金（税込）。店舗の履歴料金から、利用者の区分で通常/特別を選ぶ。
   * 適用可能な料金が未登録なら null（＝予約不可）。
   */
  private async computeMealFee(
    user: UserForFee,
    mealDateStr: string,
  ): Promise<number | null> {
    const pricing = await this.prisma.mealPricing.findFirst({
      where: {
        facilityId: user.facilityId,
        effectiveDate: { lte: new Date(mealDateStr) },
      },
      orderBy: { effectiveDate: 'desc' },
    });
    if (!pricing) return null;
    return user.useSpecialMealFee ? pricing.specialMealFee : pricing.mealFee;
  }

  /** 店舗×利用日のキャンセル料（税込）。未登録なら null。 */
  private async computeCancelFee(
    facilityId: string,
    mealDateStr: string,
  ): Promise<number | null> {
    const pricing = await this.prisma.mealPricing.findFirst({
      where: { facilityId, effectiveDate: { lte: new Date(mealDateStr) } },
      orderBy: { effectiveDate: 'desc' },
    });
    return pricing ? pricing.cancelFee : null;
  }

  /** その利用者に、対象日の承認済み通所予定があるか。 */
  private async hasSchedule(userId: string, mealDateStr: string) {
    const s = await this.prisma.schedule.findUnique({
      where: { userId_planDate: { userId, planDate: new Date(mealDateStr) } },
      select: { status: true },
    });
    return !!s && s.status === 'approved';
  }

  private serialize(m: {
    id: string;
    userId: string;
    facilityId: string;
    mealDate: Date;
    status: MealStatus;
    amount: number;
    approvalStatus: string;
    requestType: string | null;
  }) {
    return {
      id: m.id,
      userId: m.userId,
      facilityId: m.facilityId,
      mealDate: m.mealDate.toISOString().slice(0, 10),
      status: m.status,
      amount: m.amount,
      approvalStatus: m.approvalStatus,
      requestType: m.requestType,
    };
  }

  // ---------- 利用者本人（申請） ----------

  /** 自分の食事予約一覧（期間） */
  myList(userId: string, from: string, to: string) {
    return this.prisma.meal
      .findMany({
        where: { userId, mealDate: { gte: new Date(from), lte: new Date(to) } },
        orderBy: { mealDate: 'asc' },
      })
      .then((rows) => rows.map((m) => this.serialize(m)));
  }

  /**
   * 自分で食事を予約/取消（複数日一括）。
   * 締切ルール（free/application/closed）と通所予定必須を適用する。
   */
  async mySubmit(
    principal: { id: string; corporationId: string; facilityId: string },
    dto: MySubmitMealDto,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: principal.id },
      select: {
        id: true,
        corporationId: true,
        facilityId: true,
        useSpecialMealFee: true,
      },
    });
    if (!user) throw new NotFoundException('利用者が見つかりません');
    const { mealsEnabled, deadlineDays } = await this.facilityMealInfo(
      user.facilityId,
    );
    if (!mealsEnabled) {
      throw new BadRequestException('この店舗では食事の予約はできません');
    }

    const result = {
      reserved: 0, // 即確定した予約
      pendingReserve: 0, // 承認待ちの予約申請
      revoked: 0, // 無料取消
      pendingCancel: 0, // 承認待ちのキャンセル申請
      skipped: [] as { date: string; reason: string }[],
    };

    for (const date of dto.dates) {
      const window = classifyMealWindow(date, deadlineDays);
      if (window === 'closed') {
        result.skipped.push({ date, reason: '締切（前日15時）を過ぎています' });
        continue;
      }
      if (!(await this.hasSchedule(user.id, date))) {
        result.skipped.push({ date, reason: '通所予定がない日です' });
        continue;
      }
      const existing = await this.prisma.meal.findUnique({
        where: {
          userId_mealDate: { userId: user.id, mealDate: new Date(date) },
        },
      });

      if (dto.action === 'reserve') {
        // 既に承認済みの予約がある日は、承認済みを維持する（誤って承認待ちに降格させない）。
        if (
          existing &&
          existing.status === 'reserved' &&
          existing.approvalStatus === 'approved'
        ) {
          if (existing.requestType === 'cancel') {
            // キャンセル申請中 → 予約を続けるので申請を取り下げる
            await this.prisma.meal.update({
              where: { id: existing.id },
              data: { requestType: null, updatedBy: user.id },
            });
            result.reserved++;
          } else {
            result.skipped.push({ date, reason: '既に予約済みです' });
          }
          continue;
        }
        // 却下済み/取消済み/新規 → 予約申請または即確定
        const fee = await this.computeMealFee(user, date);
        if (fee === null) {
          result.skipped.push({ date, reason: '食事料金が未設定です' });
          continue;
        }
        const isFree = window === 'free';
        await this.prisma.meal.upsert({
          where: {
            userId_mealDate: { userId: user.id, mealDate: new Date(date) },
          },
          create: {
            corporationId: user.corporationId,
            facilityId: user.facilityId,
            userId: user.id,
            mealDate: new Date(date),
            status: 'reserved',
            amount: fee,
            approvalStatus: isFree ? 'approved' : 'pending',
            requestType: isFree ? null : 'reserve',
            createdBy: user.id,
            updatedBy: user.id,
            approvedAt: isFree ? new Date() : null,
          },
          update: {
            status: 'reserved',
            amount: fee,
            approvalStatus: isFree ? 'approved' : 'pending',
            requestType: isFree ? null : 'reserve',
            updatedBy: user.id,
            approvedBy: isFree ? null : null,
            approvedAt: isFree ? new Date() : null,
          },
        });
        if (isFree) result.reserved++;
        else result.pendingReserve++;
      } else {
        // cancel
        if (!existing) {
          result.skipped.push({ date, reason: '予約がありません' });
          continue;
        }
        // 承認待ちの予約申請を取り下げる場合は削除
        if (
          existing.approvalStatus === 'pending' &&
          existing.requestType === 'reserve'
        ) {
          await this.prisma.meal.delete({ where: { id: existing.id } });
          result.revoked++;
          continue;
        }
        // 取消できるのは「承認済みの予約」のみ（却下・取消済・キャンセル済は対象外）
        if (existing.status !== 'reserved' || existing.approvalStatus !== 'approved') {
          result.skipped.push({ date, reason: '予約がありません' });
          continue;
        }
        if (window === 'free') {
          await this.prisma.meal.update({
            where: { id: existing.id },
            data: {
              status: 'revoked',
              amount: 0,
              requestType: null,
              updatedBy: user.id,
              approvedAt: new Date(),
            },
          });
          result.revoked++;
        } else {
          // 申請扱い: キャンセル申請。承認状態は approved のまま維持し、
          // requestType=cancel で「承認待ちのキャンセル申請」を表す
          // （承認されるまで予約は有効＝発注数・請求から消えない）。
          await this.prisma.meal.update({
            where: { id: existing.id },
            data: {
              requestType: 'cancel',
              updatedBy: user.id,
            },
          });
          result.pendingCancel++;
        }
      }
    }
    return result;
  }

  // ---------- 管理側（override） ----------

  /** 店舗の食事予約一覧（期間）。利用者名つき。 */
  async list(
    principal: Principal,
    facilityId: string,
    from: string,
    to: string,
  ) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility.findUnique({
      where: { id: facilityId },
    });
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の食事を閲覧する権限がありません');
    }
    const rows = await this.prisma.meal.findMany({
      where: {
        facilityId,
        mealDate: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: [{ mealDate: 'asc' }],
      include: { user: { select: { lastName: true, firstName: true } } },
    });
    return rows.map((m) => ({
      ...this.serialize(m),
      userName: `${m.user.lastName} ${m.user.firstName}`,
    }));
  }

  /**
   * 管理側の予約操作（override）。締切・承認を無視して即確定する。
   * status: reserved / cancelled / revoked / eaten を直接設定できる。
   */
  async adminUpsert(principal: Principal, dto: AdminMealDto) {
    const scope = computeAccessScope(principal);
    const user = await this.userInScope(scope, dto.userId);
    const { mealsEnabled } = await this.facilityMealInfo(user.facilityId);
    if (!mealsEnabled) {
      throw new BadRequestException('この店舗では食事機能が無効です');
    }
    if (dto.status === 'reserved' && !(await this.hasSchedule(dto.userId, dto.date))) {
      throw new BadRequestException('通所予定がない日は予約できません');
    }
    // 金額: 予約/喫食済=食事料金、キャンセル=キャンセル料、取消=0
    let amount = 0;
    if (dto.status === 'reserved' || dto.status === 'eaten') {
      const fee = await this.computeMealFee(user, dto.date);
      if (fee === null) {
        throw new BadRequestException(
          '食事料金が未設定です。先に食事料金を登録してください',
        );
      }
      amount = fee;
    } else if (dto.status === 'cancelled') {
      const fee = await this.computeCancelFee(user.facilityId, dto.date);
      if (fee === null) {
        throw new BadRequestException(
          'キャンセル料が未設定です。先に食事料金を登録してください',
        );
      }
      amount = fee;
    }
    const meal = await this.prisma.meal.upsert({
      where: {
        userId_mealDate: { userId: dto.userId, mealDate: new Date(dto.date) },
      },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId: dto.userId,
        mealDate: new Date(dto.date),
        status: dto.status,
        amount,
        situation: dto.situation,
        approvalStatus: 'approved',
        requestType: null,
        createdBy: principal.id,
        updatedBy: principal.id,
        approvedBy: principal.id,
        approvedAt: new Date(),
      },
      update: {
        status: dto.status,
        amount,
        situation: dto.situation,
        approvalStatus: 'approved',
        requestType: null,
        updatedBy: principal.id,
        approvedBy: principal.id,
        approvedAt: new Date(),
      },
    });
    return this.serialize(meal);
  }

  // ---------- 承認（管理側） ----------

  private pendingWhere(principal: Principal): Prisma.MealWhereInput {
    const scope = computeAccessScope(principal);
    // 承認待ち＝予約申請(requestType=reserve)またはキャンセル申請(requestType=cancel)。
    // キャンセル申請中は approvalStatus=approved のままなので requestType で判定する。
    const where: Prisma.MealWhereInput = { requestType: { not: null } };
    if (!scope.crossTenant) {
      if (scope.allFacilitiesInCorporation) {
        where.corporationId = scope.corporationId ?? '__none__';
      } else {
        where.facilityId = { in: scope.facilityIds };
      }
    }
    return where;
  }

  async listPending(principal: Principal) {
    const rows = await this.prisma.meal.findMany({
      where: this.pendingWhere(principal),
      orderBy: { mealDate: 'asc' },
      include: { user: { select: { lastName: true, firstName: true } } },
    });
    return rows.map((m) => ({
      ...this.serialize(m),
      userName: `${m.user.lastName} ${m.user.firstName}`,
    }));
  }

  async pendingCount(principal: Principal) {
    const count = await this.prisma.meal.count({
      where: this.pendingWhere(principal),
    });
    return { count };
  }

  async decide(
    principal: Principal,
    id: string,
    decision: 'approved' | 'rejected',
  ) {
    const scope = computeAccessScope(principal);
    const meal = await this.prisma.meal.findUnique({ where: { id } });
    if (!meal) throw new NotFoundException('食事予約が見つかりません');
    await this.userInScope(scope, meal.userId);
    if (meal.requestType === null) {
      throw new BadRequestException('承認待ちの申請ではありません');
    }

    const base = {
      approvedBy: principal.id,
      approvedAt: new Date(),
      requestType: null,
    };

    if (decision === 'approved') {
      if (meal.requestType === 'cancel') {
        // キャンセル承認 → キャンセル料を確定
        const fee = await this.computeCancelFee(
          meal.facilityId,
          meal.mealDate.toISOString().slice(0, 10),
        );
        return this.serialize(
          await this.prisma.meal.update({
            where: { id },
            data: {
              ...base,
              status: 'cancelled',
              amount: fee ?? 0,
              approvalStatus: 'approved',
            },
          }),
        );
      }
      // 予約承認
      return this.serialize(
        await this.prisma.meal.update({
          where: { id },
          data: { ...base, approvalStatus: 'approved' },
        }),
      );
    }

    // 却下
    if (meal.requestType === 'cancel') {
      // キャンセル却下 → 予約のまま
      return this.serialize(
        await this.prisma.meal.update({
          where: { id },
          data: { ...base, status: 'reserved', approvalStatus: 'approved' },
        }),
      );
    }
    // 予約却下 → 却下として記録（無効）
    return this.serialize(
      await this.prisma.meal.update({
        where: { id },
        data: { ...base, approvalStatus: 'rejected' },
      }),
    );
  }
}
