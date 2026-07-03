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
import { MySubmitScheduleDto } from './dto/my-submit-schedule.dto';
import { computeAutoApproveStatus } from './schedule-rules';

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
    try {
      return await this.prisma.schedule.create({
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
    return this.prisma.schedule.update({
      where: { id },
      data: {
        planIn: dto.planIn,
        planOut: dto.planOut,
        note: dto.note,
      },
    });
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
      include: { user: { select: { lastName: true, firstName: true } } },
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
  ) {
    const scope = computeAccessScope(principal);
    const schedule = await this.prisma.schedule.findUnique({ where: { id } });
    if (!schedule) throw new NotFoundException('予定が見つかりません');
    await this.userInScope(scope, schedule.userId);
    return this.prisma.schedule.update({
      where: { id },
      data: {
        status: decision,
        approvedBy: principal.id,
        approvedAt: new Date(),
      },
    });
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
        approvedBy: null,
        approvedAt: status === 'approved' ? new Date() : null,
      },
    });
    return { schedule, autoApproved: status === 'approved' };
  }
}
