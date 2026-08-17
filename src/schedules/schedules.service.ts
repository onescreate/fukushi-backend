import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { CreateScheduleDto } from './dto/create-schedule.dto';
import { UpdateScheduleDto } from './dto/update-schedule.dto';
import { BulkScheduleDto } from './dto/bulk-schedule.dto';
import { CreateScheduleDetailDto } from './dto/create-detail.dto';
import {
  MySubmitScheduleDto,
  MyBulkSubmitScheduleDto,
} from './dto/my-submit-schedule.dto';
import { computeAutoApproveStatus } from './schedule-rules';
import { assertBreakOrder, assertPlanOrder } from '../common/time-range';

@Injectable()
export class SchedulesService {
  constructor(private readonly prisma: PrismaService) {}

  /** 対象利用者がスコープ内か検証し、レコードを返す */
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
   * 実習の明細（practice）を予定に反映する。
   * - undefined … 触らない（従来どおりの更新）
   * - 空文字    … 実習を解除（practice明細を削除）＝通所日に戻す
   * - 文字列    … 実習先つきのpractice明細を1件だけ持たせる。実習日に中抜けは無いので break_out は削除。
   * 利用者本人の申請(mySubmit)と同じ意味づけに揃えてある。
   */
  private async syncPractice(
    scheduleId: string,
    practicePlace: string | undefined,
  ) {
    if (practicePlace === undefined) return;
    const place = practicePlace.trim();
    await this.prisma.scheduleDetail.deleteMany({
      where: {
        scheduleId,
        eventType: place ? { in: ['practice', 'break_out'] } : 'practice',
      },
    });
    if (place) {
      await this.prisma.scheduleDetail.create({
        data: { scheduleId, eventType: 'practice', note: place },
      });
    }
  }

  /** 指定利用者の、期間内の予定一覧 */
  async list(principal: Principal, userId: string, from: string, to: string) {
    const scope = computeAccessScope(principal);
    await this.userInScope(scope, userId);
    return this.prisma.schedule.findMany({
      where: {
        userId,
        planDate: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { planDate: 'asc' },
      include: { details: true },
    });
  }

  async create(principal: Principal, dto: CreateScheduleDto) {
    const scope = computeAccessScope(principal);
    const user = await this.userInScope(scope, dto.userId);
    assertPlanOrder(dto.planIn, dto.planOut);
    try {
      const schedule = await this.prisma.schedule.create({
        data: {
          corporationId: user.corporationId,
          facilityId: user.facilityId,
          userId: user.id,
          planDate: new Date(dto.planDate),
          planIn: dto.planIn,
          planOut: dto.planOut,
          note: dto.note,
          status: 'approved', // スタッフ登録は承認済み扱い
          createdBy: principal.id,
        },
      });
      await this.syncPractice(schedule.id, dto.practicePlace);
      return schedule;
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new BadRequestException('その日の予定は既に登録されています');
      }
      throw e;
    }
  }

  async update(principal: Principal, id: string, dto: UpdateScheduleDto) {
    const scope = computeAccessScope(principal);
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('予定が見つかりません');
    await this.userInScope(scope, schedule.userId);
    assertPlanOrder(
      dto.planIn ?? schedule.planIn,
      dto.planOut ?? schedule.planOut,
    );
    const updated = await this.prisma.schedule.update({
      where: { id },
      data: {
        planIn: dto.planIn,
        planOut: dto.planOut,
        note: dto.note,
      },
    });
    await this.syncPractice(id, dto.practicePlace);
    return updated;
  }

  async remove(principal: Principal, id: string) {
    const scope = computeAccessScope(principal);
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('予定が見つかりません');
    await this.userInScope(scope, schedule.userId);
    await this.prisma.schedule.delete({ where: { id } });
    return { ok: true };
  }

  /** 複数日を一括登録（既存の日はスキップ） */
  async bulkCreate(principal: Principal, dto: BulkScheduleDto) {
    const scope = computeAccessScope(principal);
    const user = await this.userInScope(scope, dto.userId);
    assertPlanOrder(dto.planIn, dto.planOut);
    const data = dto.dates.map((d) => ({
      corporationId: user.corporationId,
      facilityId: user.facilityId,
      userId: user.id,
      planDate: new Date(d),
      planIn: dto.planIn,
      planOut: dto.planOut,
      status: 'approved' as const,
      createdBy: principal.id,
    }));
    const res = await this.prisma.schedule.createMany({
      data,
      skipDuplicates: true,
    });
    return { created: res.count, skipped: dto.dates.length - res.count };
  }

  // ---------- 中抜け等（明細） ----------

  async addDetail(
    principal: Principal,
    scheduleId: string,
    dto: CreateScheduleDetailDto,
  ) {
    const scope = computeAccessScope(principal);
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });
    if (!schedule) throw new NotFoundException('予定が見つかりません');
    await this.userInScope(scope, schedule.userId);
    assertBreakOrder(dto.plannedOut, dto.plannedIn);
    return this.prisma.scheduleDetail.create({
      data: {
        scheduleId,
        eventType: dto.eventType ?? 'break_out',
        plannedOut: dto.plannedOut,
        plannedIn: dto.plannedIn,
        note: dto.note,
      },
    });
  }

  async removeDetail(principal: Principal, detailId: string) {
    const scope = computeAccessScope(principal);
    const detail = await this.prisma.scheduleDetail.findUnique({
      where: { id: detailId },
      include: { schedule: true },
    });
    if (!detail) throw new NotFoundException('中抜けが見つかりません');
    await this.userInScope(scope, detail.schedule.userId);
    await this.prisma.scheduleDetail.delete({ where: { id: detailId } });
    return { ok: true };
  }

  // ---------- 承認（管理側） ----------

  /** スコープ内の承認待ち予定 */
  listPending(principal: Principal) {
    const scope = computeAccessScope(principal);
    const where: Prisma.ScheduleWhereInput = { status: 'pending' };
    if (!scope.crossTenant) {
      if (scope.allFacilitiesInCorporation) {
        where.corporationId = scope.corporationId ?? '__none__';
      } else {
        where.facilityId = { in: scope.facilityIds };
      }
    }
    return this.prisma.schedule.findMany({
      where,
      orderBy: { planDate: 'asc' },
      // 明細(中抜け・実習)も返す。承認画面で「利用者が何を申請したか」をそのまま見せるため。
      include: {
        user: { select: { lastName: true, firstName: true } },
        details: true,
      },
    });
  }

  async pendingCount(principal: Principal) {
    const list = await this.listPending(principal);
    return { count: list.length };
  }

  async decide(
    principal: Principal,
    id: string,
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    const scope = computeAccessScope(principal);
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('予定が見つかりません');
    await this.userInScope(scope, schedule.userId);
    return this.prisma.schedule.update({
      where: { id },
      data: {
        status: decision,
        // 却下理由は却下のときだけ残す（承認したら消す）。
        rejectReason: decision === 'rejected' ? (reason?.trim() || null) : null,
        approvedBy: principal.id,
        approvedAt: new Date(),
      },
    });
  }

  /**
   * 複数の予定をまとめて承認/却下する。
   * 1件ずつ decide() を通す（権限・所属のチェックを一括でも省かない）。
   * 途中で失敗しても他の件は処理し、結果を件数で返す。
   */
  async bulkDecide(
    principal: Principal,
    ids: string[],
    decision: 'approved' | 'rejected',
    reason?: string,
  ) {
    let done = 0;
    const failed: { id: string; message: string }[] = [];
    for (const id of ids) {
      try {
        await this.decide(principal, id, decision, reason);
        done++;
      } catch (e) {
        failed.push({
          id,
          message: e instanceof Error ? e.message : '処理できませんでした',
        });
      }
    }
    return { done, failed };
  }

  // ---------- 利用者本人用（申請） ----------

  /** 自分の予定一覧 */
  myList(userId: string, from: string, to: string) {
    return this.prisma.schedule.findMany({
      where: { userId, planDate: { gte: new Date(from), lte: new Date(to) } },
      orderBy: { planDate: 'asc' },
      include: { details: true },
    });
  }

  /** 自分の予定を申請（自動承認ルールで承認済/承認待ちが決まる） */
  async mySubmit(
    principal: { id: string; corporationId: string; facilityId: string },
    dto: MySubmitScheduleDto,
  ) {
    assertPlanOrder(dto.planIn, dto.planOut);
    for (const b of dto.breaks ?? []) assertBreakOrder(b.plannedOut, b.plannedIn);
    const status = computeAutoApproveStatus(dto.planDate);
    const schedule = await this.prisma.schedule.upsert({
      where: {
        userId_planDate: {
          userId: principal.id,
          planDate: new Date(dto.planDate),
        },
      },
      create: {
        corporationId: principal.corporationId,
        facilityId: principal.facilityId,
        userId: principal.id,
        planDate: new Date(dto.planDate),
        planIn: dto.planIn,
        planOut: dto.planOut,
        note: dto.note,
        status,
        createdBy: principal.id,
        approvedAt: status === 'approved' ? new Date() : null,
      },
      update: {
        planIn: dto.planIn,
        planOut: dto.planOut,
        note: dto.note,
        status,
        // 出し直したら前回の却下理由は消す（差戻の表示が残り続けないように）
        rejectReason: null,
        approvedBy: null,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });
    // 明細の洗い替え（利用者が申請するのは 実習(practice) または 中抜け(break_out) のみ）
    await this.prisma.scheduleDetail.deleteMany({
      where: {
        scheduleId: schedule.id,
        eventType: { in: ['break_out', 'practice'] },
      },
    });
    if (dto.practicePlace) {
      // 実習日：実習先を note に持つ practice 明細を1件（中抜けは対象外）
      await this.prisma.scheduleDetail.create({
        data: {
          scheduleId: schedule.id,
          eventType: 'practice',
          note: dto.practicePlace,
        },
      });
    } else {
      // 通所日：中抜けを登録
      const breaks = (dto.breaks ?? []).filter(
        (b) => b.plannedOut || b.plannedIn,
      );
      if (breaks.length) {
        await this.prisma.scheduleDetail.createMany({
          data: breaks.map((b) => ({
            scheduleId: schedule.id,
            eventType: 'break_out' as const,
            plannedOut: b.plannedOut ?? null,
            plannedIn: b.plannedIn ?? null,
            note: b.note ?? null,
          })),
        });
      }
    }
    return { schedule, autoApproved: status === 'approved' };
  }

  /** 複数日にまとめて同じ通所時間を申請（中抜けは触らず、各日の既存明細はそのまま）。 */
  async myBulkSubmit(
    principal: { id: string; corporationId: string; facilityId: string },
    dto: MyBulkSubmitScheduleDto,
  ) {
    assertPlanOrder(dto.planIn, dto.planOut);
    let approved = 0;
    let pending = 0;
    for (const date of dto.dates) {
      const status = computeAutoApproveStatus(date);
      await this.prisma.schedule.upsert({
        where: {
          userId_planDate: {
            userId: principal.id,
            planDate: new Date(date),
          },
        },
        create: {
          corporationId: principal.corporationId,
          facilityId: principal.facilityId,
          userId: principal.id,
          planDate: new Date(date),
          planIn: dto.planIn,
          planOut: dto.planOut,
          note: dto.note,
          status,
          createdBy: principal.id,
          approvedAt: status === 'approved' ? new Date() : null,
        },
        update: {
          planIn: dto.planIn,
          planOut: dto.planOut,
          note: dto.note,
          status,
          rejectReason: null,
          approvedBy: null,
          approvedAt: status === 'approved' ? new Date() : null,
        },
      });
      if (status === 'approved') approved++;
      else pending++;
    }
    return { approved, pending };
  }
}
