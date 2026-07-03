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
import { UpdateAttendanceSettingsDto } from './dto/attendance-settings.dto';

const pad = (n: number) => String(n).padStart(2, '0');

/** 現在時刻をJSTの壁時計として扱う */
function jstNow(now = new Date()): Date {
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}
function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}
function toHHMM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- 設定（店舗ごとの猶予） ----------

  async getSettings(facilityId: string) {
    const s = await this.prisma.attendanceSetting.findUnique({
      where: { facilityId },
    });
    return {
      facilityId,
      lateGraceMinutes: s?.lateGraceMinutes ?? 0,
      earlyLeaveGraceMinutes: s?.earlyLeaveGraceMinutes ?? 0,
    };
  }

  async upsertSettings(
    principal: Principal,
    facilityId: string,
    dto: UpdateAttendanceSettingsDto,
  ) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗の設定を変更する権限がありません');
    }
    await this.prisma.attendanceSetting.upsert({
      where: { facilityId },
      create: {
        facilityId,
        lateGraceMinutes: dto.lateGraceMinutes,
        earlyLeaveGraceMinutes: dto.earlyLeaveGraceMinutes,
      },
      update: {
        lateGraceMinutes: dto.lateGraceMinutes,
        earlyLeaveGraceMinutes: dto.earlyLeaveGraceMinutes,
      },
    });
    return this.getSettings(facilityId);
  }

  /** 本日(JST)の打刻状態 */
  async getTodayStatus(userId: string) {
    const workDate = new Date(dateStr(jstNow()));
    const att = await this.prisma.attendance.findUnique({
      where: { userId_workDate: { userId, workDate } },
    });
    return { clockedIn: !!att?.clockIn, clockedOut: !!att?.clockOut };
  }

  /** 打刻画面に出す「今日の予定・中抜け」情報 */
  async getTodayInfo(userId: string) {
    const workDate = new Date(dateStr(jstNow()));
    const schedule = await this.prisma.schedule.findUnique({
      where: { userId_planDate: { userId, planDate: workDate } },
      include: { details: true },
    });
    return {
      planIn: schedule?.planIn ?? null,
      planOut: schedule?.planOut ?? null,
      status: schedule?.status ?? null,
      breaks: (schedule?.details ?? [])
        .filter((d) => d.eventType === 'break_out')
        .map((d) => ({
          plannedOut: d.plannedOut,
          plannedIn: d.plannedIn,
        })),
      // 食事は Phase 3（食事管理）で実装予定
      meal: null as null | { status: string },
    };
  }

  /** 打刻画面に出すアラート（差戻・理由未入力） */
  async getAlerts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { corporationId: true, facilityId: true },
    });
    if (!user) return { rejected: [], reasonNeeded: [] };

    const today = new Date(dateStr(jstNow()));

    // 差戻（却下された申請）
    const rejected = await this.prisma.schedule.findMany({
      where: { userId, status: 'rejected' },
      orderBy: { planDate: 'desc' },
      take: 20,
      select: { id: true, planDate: true },
    });

    // 過去の承認済み予定で打刻が無い日 → 欠席レコードを用意（遅延生成）
    const pastApproved = await this.prisma.schedule.findMany({
      where: { userId, status: 'approved', planDate: { lt: today } },
      orderBy: { planDate: 'desc' },
      take: 60,
      select: { planDate: true },
    });
    for (const s of pastApproved) {
      const att = await this.prisma.attendance.findUnique({
        where: { userId_workDate: { userId, workDate: s.planDate } },
      });
      if (!att) {
        await this.prisma.attendance.create({
          data: {
            corporationId: user.corporationId,
            facilityId: user.facilityId,
            userId,
            workDate: s.planDate,
            status: 'absent',
            createdBy: userId,
          },
        });
      } else if (!att.clockIn && att.status !== 'absent') {
        await this.prisma.attendance.update({
          where: { id: att.id },
          data: { status: 'absent' },
        });
      }
    }

    // 理由未入力（欠席は過去のみ・遅刻/早退は当日も含む）
    const todayStr = dateStr(jstNow());
    const atts = await this.prisma.attendance.findMany({
      where: {
        userId,
        workDate: { lte: today },
        OR: [
          { status: 'absent', absenceReason: null },
          { isLate: true, lateReason: null },
          { isEarlyLeave: true, earlyLeaveReason: null },
        ],
      },
      orderBy: { workDate: 'desc' },
      take: 30,
    });
    const reasonNeeded: { date: string; kind: 'absence' | 'late' | 'early' }[] =
      [];
    for (const a of atts) {
      const d = dateStr(a.workDate);
      if (a.status === 'absent' && !a.absenceReason && d < todayStr)
        reasonNeeded.push({ date: d, kind: 'absence' });
      if (a.isLate && !a.lateReason) reasonNeeded.push({ date: d, kind: 'late' });
      if (a.isEarlyLeave && !a.earlyLeaveReason)
        reasonNeeded.push({ date: d, kind: 'early' });
    }

    return {
      rejected: rejected.map((r) => ({ date: dateStr(r.planDate) })),
      reasonNeeded,
    };
  }

  /** 欠席・遅刻・早退の理由を入力 */
  async submitReason(
    userId: string,
    date: string,
    kind: 'absence' | 'late' | 'early',
    reason: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { corporationId: true, facilityId: true },
    });
    if (!user) throw new BadRequestException('利用者が見つかりません');
    const workDate = new Date(date);
    const field =
      kind === 'absence'
        ? 'absenceReason'
        : kind === 'late'
          ? 'lateReason'
          : 'earlyLeaveReason';
    await this.prisma.attendance.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId,
        workDate,
        status: kind === 'absence' ? 'absent' : 'present',
        [field]: reason,
        createdBy: userId,
      },
      update: { [field]: reason },
    });
    return { ok: true };
  }

  // ---------- 打刻（キオスクから呼ぶ） ----------

  /**
   * 通所/退所の打刻を記録し、遅刻・早退を判定する。
   * 予定が無い日は「承認待ちの予定」を自動作成する（飛び込み）。
   */
  async recordClock(userId: string, type: 'in' | 'out') {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        corporationId: true,
        facilityId: true,
        lastName: true,
        firstName: true,
        status: true,
      },
    });
    if (!user || user.status !== 'active') {
      throw new BadRequestException('利用者が見つかりません');
    }

    const settings = await this.getSettings(user.facilityId);
    const jst = jstNow();
    const workDate = new Date(dateStr(jst));
    const nowInstant = new Date();
    const nowMin = minutesOfDay(jst);
    const userName = `${user.lastName} ${user.firstName}`;

    const scheduleKey = { userId_planDate: { userId, planDate: workDate } };
    let schedule = await this.prisma.schedule.findUnique({
      where: scheduleKey,
    });
    const existing = await this.prisma.attendance.findUnique({
      where: { userId_workDate: { userId, workDate } },
    });

    if (type === 'in') {
      if (existing?.clockIn) {
        return {
          user: { id: userId, name: userName },
          type,
          time: toHHMM(jstNow(existing.clockIn)),
          isLate: existing.isLate,
          alreadyDone: true,
        };
      }

      let autoScheduled = false;
      if (!schedule) {
        schedule = await this.prisma.schedule.create({
          data: {
            corporationId: user.corporationId,
            facilityId: user.facilityId,
            userId,
            planDate: workDate,
            planIn: toHHMM(jst),
            status: 'pending',
            note: '打刻により自動作成',
            createdBy: userId,
          },
        });
        autoScheduled = true;
      }

      let isLate = false;
      if (schedule.status === 'approved' && schedule.planIn) {
        const pin = parseHHMM(schedule.planIn);
        if (pin !== null && nowMin > pin + settings.lateGraceMinutes) {
          isLate = true;
        }
      }

      const att = await this.prisma.attendance.upsert({
        where: { userId_workDate: { userId, workDate } },
        create: {
          corporationId: user.corporationId,
          facilityId: user.facilityId,
          userId,
          workDate,
          clockIn: nowInstant,
          status: 'present',
          isLate,
          createdBy: userId,
        },
        update: { clockIn: nowInstant, isLate },
      });
      return {
        user: { id: userId, name: userName },
        type,
        time: toHHMM(jst),
        isLate: att.isLate,
        autoScheduled,
        alreadyDone: false,
      };
    }

    // type === 'out'
    if (!existing?.clockIn) {
      throw new BadRequestException('先に通所打刻をしてください');
    }
    if (existing.clockOut) {
      return {
        user: { id: userId, name: userName },
        type,
        time: toHHMM(jstNow(existing.clockOut)),
        isEarlyLeave: existing.isEarlyLeave,
        alreadyDone: true,
      };
    }

    let isEarlyLeave = false;
    if (schedule && schedule.status === 'approved' && schedule.planOut) {
      const pout = parseHHMM(schedule.planOut);
      if (pout !== null && nowMin < pout - settings.earlyLeaveGraceMinutes) {
        isEarlyLeave = true;
      }
    }
    const att = await this.prisma.attendance.upsert({
      where: { userId_workDate: { userId, workDate } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId,
        workDate,
        clockOut: nowInstant,
        status: 'present',
        isEarlyLeave,
        createdBy: userId,
      },
      update: { clockOut: nowInstant, isEarlyLeave },
    });
    return {
      user: { id: userId, name: userName },
      type,
      time: toHHMM(jst),
      isEarlyLeave: att.isEarlyLeave,
      alreadyDone: false,
    };
  }
}
