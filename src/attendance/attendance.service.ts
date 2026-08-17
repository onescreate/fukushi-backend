import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import {
  resolveFacilityIds,
} from '../common/facility-scope';
import { UpdateAttendanceSettingsDto } from './dto/attendance-settings.dto';
import { ManualAttendanceDto } from './dto/manual-attendance.dto';
import { isLateArrival, isEarlyDeparture } from './attendance-rules';

import {
  pad,
  jstNow,
  dateStr,
  toHHMM,
  minutesOfDay,
  parseHHMM,
} from '../common/date';
import { assertClockOrder } from '../common/time-range';

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

  /** 利用者本人の実績履歴（期間） */
  async myHistory(userId: string, from: string, to: string) {
    const rows = await this.prisma.attendance.findMany({
      where: {
        userId,
        workDate: { gte: new Date(from), lte: new Date(to) },
      },
      orderBy: { workDate: 'desc' },
    });
    return rows.map((a) => ({
      date: dateStr(a.workDate),
      status: a.status,
      clockIn: a.clockIn ? toHHMM(jstNow(a.clockIn)) : null,
      clockOut: a.clockOut ? toHHMM(jstNow(a.clockOut)) : null,
      isLate: a.isLate,
      isEarlyLeave: a.isEarlyLeave,
      absenceReason: a.absenceReason,
      lateReason: a.lateReason,
      earlyLeaveReason: a.earlyLeaveReason,
    }));
  }

  /** 本日(JST)の打刻状態 */
  async getTodayStatus(userId: string) {
    const workDate = new Date(dateStr(jstNow()));
    const att = await this.prisma.attendance.findUnique({
      where: { userId_workDate: { userId, workDate } },
    });
    return { clockedIn: !!att?.clockIn, clockedOut: !!att?.clockOut };
  }

  /** 当日ロースター（店舗×日付の利用者一覧＋予定＋打刻状況）。facilityId='all'で全店舗合算。 */
  async roster(principal: Principal, facilityId: string, date: string) {
    const facilityIds = await resolveFacilityIds(
      this.prisma,
      principal,
      facilityId,
    );
    const allMode = facilityIds.length > 1; // 複数店舗のとき店舗名を表示
    const facMap = new Map(
      (
        await this.prisma.facility.findMany({
          where: { id: { in: facilityIds } },
          select: { id: true, name: true },
        })
      ).map((f) => [f.id, f.name]),
    );

    const workDate = new Date(date);
    const todayStr = dateStr(jstNow());

    const schedules = await this.prisma.schedule.findMany({
      where: { facilityId: { in: facilityIds }, planDate: workDate },
      include: {
        user: { select: { lastName: true, firstName: true } },
        details: true,
      },
    });
    const attendances = await this.prisma.attendance.findMany({
      where: { facilityId: { in: facilityIds }, workDate },
    });
    const meals = await this.prisma.meal.findMany({
      where: {
        facilityId: { in: facilityIds },
        mealDate: workDate,
        approvalStatus: 'approved',
      },
    });

    const schByUser = new Map(schedules.map((s) => [s.userId, s]));
    const attByUser = new Map(attendances.map((a) => [a.userId, a]));
    const mealByUser = new Map(meals.map((m) => [m.userId, m]));
    const userIds = [
      ...new Set([
        ...schByUser.keys(),
        ...attByUser.keys(),
        ...mealByUser.keys(),
      ]),
    ];

    // 予定に無い利用者（打刻のみ・食事のみ）は名前を別途引く
    const missingNames = userIds.filter((id) => !schByUser.has(id));
    const extraUsers = missingNames.length
      ? await this.prisma.user.findMany({
          where: { id: { in: missingNames } },
          select: { id: true, lastName: true, firstName: true },
        })
      : [];
    const nameMap = new Map(extraUsers.map((u) => [u.id, u]));

    const rows = userIds.map((userId) => {
      const s = schByUser.get(userId);
      const a = attByUser.get(userId);
      const m = mealByUser.get(userId);
      const u = s?.user ?? nameMap.get(userId);
      const fid = s?.facilityId ?? a?.facilityId ?? m?.facilityId ?? '';
      let status: 'present' | 'absent' | 'notyet';
      if (a?.clockIn) status = 'present';
      else if (a?.status === 'absent') status = 'absent';
      else status = date < todayStr ? 'absent' : 'notyet';
      return {
        userId,
        name: u ? `${u.lastName} ${u.firstName}` : '—',
        facilityName: allMode ? (facMap.get(fid) ?? '') : null,
        planIn: s?.planIn ?? null,
        planOut: s?.planOut ?? null,
        scheduleStatus: s?.status ?? null,
        practicePlace:
          (s?.details ?? []).find((d) => d.eventType === 'practice')?.note ??
          null,
        breaks: (s?.details ?? [])
          .filter((d) => d.eventType === 'break_out')
          .map((d) => ({
            plannedOut: d.plannedOut,
            plannedIn: d.plannedIn,
            note: d.note,
          })),
        clockIn: a?.clockIn ? toHHMM(jstNow(a.clockIn)) : null,
        clockOut: a?.clockOut ? toHHMM(jstNow(a.clockOut)) : null,
        status,
        isLate: a?.isLate ?? false,
        isEarlyLeave: a?.isEarlyLeave ?? false,
        absenceReason: a?.absenceReason ?? null,
        lateReason: a?.lateReason ?? null,
        earlyLeaveReason: a?.earlyLeaveReason ?? null,
        // 管理者が手で補正した記録（null=打刻そのまま）
        manualEditedAt: a?.manualEditedAt ? a.manualEditedAt.toISOString() : null,
        manualEditedByName: a?.manualEditedByName ?? null,
        meal:
          m && (m.status === 'reserved' || m.status === 'eaten')
            ? { status: m.status }
            : null,
      };
    });
    rows.sort((x, y) => x.name.localeCompare(y.name, 'ja'));
    return rows;
  }

  /** 打刻データ一覧（店舗×年月の予定/実績を日別に一覧）。facilityId='all'で全店舗。 */
  async monthlyList(
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
    const allMode = facilityIds.length > 1; // 複数店舗のとき店舗名を表示
    const facMap = new Map(
      (
        await this.prisma.facility.findMany({
          where: { id: { in: facilityIds } },
          select: { id: true, name: true },
        })
      ).map((f) => [f.id, f.name]),
    );
    const lastDay = new Date(year, month, 0).getDate();
    const from = new Date(`${year}-${pad(month)}-01`);
    const to = new Date(`${year}-${pad(month)}-${pad(lastDay)}`);
    const todayStr = dateStr(jstNow());

    const schedules = await this.prisma.schedule.findMany({
      where: { facilityId: { in: facilityIds }, planDate: { gte: from, lte: to } },
      // 明細(実習・中抜け)も返す。一覧の「予定」欄に実習/中抜けを出すため。
      include: {
        user: { select: { lastName: true, firstName: true } },
        details: true,
      },
    });
    const attendances = await this.prisma.attendance.findMany({
      where: { facilityId: { in: facilityIds }, workDate: { gte: from, lte: to } },
      include: { user: { select: { lastName: true, firstName: true } } },
    });

    type Row = {
      key: string;
      userId: string;
      userName: string;
      facilityName: string | null;
      date: string;
      planIn: string | null;
      planOut: string | null;
      actIn: string | null;
      actOut: string | null;
      status: 'present' | 'absent' | 'notyet';
      reason: string | null;
      /** 実習先（実習日のみ。null=通常の通所） */
      practicePlace: string | null;
      /** 中抜け（外出→戻り・用件つき） */
      breaks: {
        plannedOut: string | null;
        plannedIn: string | null;
        note: string | null;
      }[];
      /** 管理者が手で補正した記録（null=打刻そのまま） */
      manualEditedAt: string | null;
      manualEditedByName: string | null;
    };
    const map = new Map<string, Row>();
    for (const s of schedules) {
      const date = s.planDate.toISOString().slice(0, 10);
      const key = `${s.userId}|${date}`;
      map.set(key, {
        key,
        userId: s.userId,
        userName: `${s.user.lastName} ${s.user.firstName}`,
        facilityName: allMode ? (facMap.get(s.facilityId) ?? '') : null,
        date,
        planIn: s.planIn ?? null,
        planOut: s.planOut ?? null,
        actIn: null,
        actOut: null,
        status: date < todayStr ? 'absent' : 'notyet',
        reason: null,
        practicePlace:
          (s.details ?? []).find((d) => d.eventType === 'practice')?.note ??
          null,
        breaks: (s.details ?? [])
          .filter((d) => d.eventType === 'break_out')
          .map((d) => ({
            plannedOut: d.plannedOut,
            plannedIn: d.plannedIn,
            note: d.note,
          })),
        manualEditedAt: null,
        manualEditedByName: null,
      });
    }
    for (const a of attendances) {
      const date = a.workDate.toISOString().slice(0, 10);
      const key = `${a.userId}|${date}`;
      const base =
        map.get(key) ??
        ({
          key,
          userId: a.userId,
          userName: `${a.user.lastName} ${a.user.firstName}`,
          facilityName: allMode ? (facMap.get(a.facilityId) ?? '') : null,
          date,
          planIn: null,
          planOut: null,
          actIn: null,
          actOut: null,
          status: 'notyet',
          reason: null,
          practicePlace: null,
          breaks: [],
          manualEditedAt: null,
          manualEditedByName: null,
        } as Row);
      base.actIn = a.clockIn ? toHHMM(jstNow(a.clockIn)) : null;
      base.actOut = a.clockOut ? toHHMM(jstNow(a.clockOut)) : null;
      base.status = a.clockIn ? 'present' : a.status === 'absent' ? 'absent' : base.status;
      base.reason = a.absenceReason ?? a.lateReason ?? a.earlyLeaveReason ?? null;
      base.manualEditedAt = a.manualEditedAt
        ? a.manualEditedAt.toISOString()
        : null;
      base.manualEditedByName = a.manualEditedByName ?? null;
      map.set(key, base);
    }
    const rows = [...map.values()];
    rows.sort(
      (x, y) => x.date.localeCompare(y.date) || x.userName.localeCompare(y.userName, 'ja'),
    );
    return { year, month, allMode, rows };
  }

  /**
   * 管理側の手動補正（打刻時刻・欠席・理由）。
   * - 退所が通所より前になる入力は弾く
   * - 補正後の時刻で遅刻・早退を判定し直す（打刻し直したのと同じ状態にする）
   * - 「誰が・いつ補正したか」を残し、一覧に「手修正」と出せるようにする
   */
  async manualUpdate(principal: Principal, dto: ManualAttendanceDto) {
    const scope = computeAccessScope(principal);
    const user = await this.prisma.user
      .findUnique({
        where: { id: dto.userId },
        select: { corporationId: true, facilityId: true },
      })
      .catch(() => null);
    if (!user) throw new BadRequestException('利用者が見つかりません');
    if (
      !canAccessFacility(scope, {
        id: user.facilityId,
        corporationId: user.corporationId,
      })
    ) {
      throw new ForbiddenException('この利用者を操作する権限がありません');
    }
    assertClockOrder(dto.clockIn, dto.clockOut);

    const workDate = new Date(dto.date);
    const toInstant = (hhmm?: string) =>
      hhmm ? new Date(`${dto.date}T${hhmm}:00+09:00`) : undefined;

    // 補正後の時刻で遅刻・早退を判定し直す（従来は打刻時の判定が残りっぱなしだった）。
    const { isLate, isEarlyLeave } = await this.recomputeLateEarly(
      dto.userId,
      user.facilityId,
      workDate,
      dto.status ?? 'present',
      dto.clockIn,
      dto.clockOut,
    );

    const editedName = principal.type === 'staff' ? principal.name : null;
    const data = {
      status: dto.status,
      clockIn: toInstant(dto.clockIn),
      clockOut: toInstant(dto.clockOut),
      isLate,
      isEarlyLeave,
      absenceReason: dto.absenceReason,
      lateReason: dto.lateReason,
      earlyLeaveReason: dto.earlyLeaveReason,
      updatedBy: principal.id,
      manualEditedAt: new Date(),
      manualEditedByName: editedName,
    };

    await this.prisma.attendance.upsert({
      where: { userId_workDate: { userId: dto.userId, workDate } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId: dto.userId,
        workDate,
        status: dto.status ?? 'present',
        clockIn: toInstant(dto.clockIn),
        clockOut: toInstant(dto.clockOut),
        isLate,
        isEarlyLeave,
        absenceReason: dto.absenceReason,
        lateReason: dto.lateReason,
        earlyLeaveReason: dto.earlyLeaveReason,
        createdBy: principal.id,
        updatedBy: principal.id,
        manualEditedAt: new Date(),
        manualEditedByName: editedName,
      },
      update: data,
    });
    return { ok: true };
  }

  /**
   * 補正後の時刻から遅刻・早退を計算し直す。
   * 打刻時と同じ規則（承認済みの予定に対してのみ判定・店舗の猶予を適用）を使う。
   * 欠席にした場合や時刻が空の場合は false（フラグを残さない）。
   */
  private async recomputeLateEarly(
    userId: string,
    facilityId: string,
    workDate: Date,
    status: 'present' | 'absent',
    clockIn?: string,
    clockOut?: string,
  ): Promise<{ isLate: boolean; isEarlyLeave: boolean }> {
    if (status === 'absent') return { isLate: false, isEarlyLeave: false };
    const schedule = await this.prisma.schedule.findUnique({
      where: { userId_planDate: { userId, planDate: workDate } },
      select: { status: true, planIn: true, planOut: true },
    });
    if (!schedule || schedule.status !== 'approved') {
      return { isLate: false, isEarlyLeave: false };
    }
    const settings = await this.getSettings(facilityId);
    const inMin = clockIn ? parseHHMM(clockIn) : null;
    const outMin = clockOut ? parseHHMM(clockOut) : null;
    return {
      isLate:
        inMin !== null &&
        isLateArrival(schedule.planIn, inMin, settings.lateGraceMinutes),
      isEarlyLeave:
        outMin !== null &&
        isEarlyDeparture(
          schedule.planOut,
          outMin,
          settings.earlyLeaveGraceMinutes,
        ),
    };
  }

  /** 打刻画面に出す「今日の予定・中抜け・食事」情報 */
  async getTodayInfo(userId: string) {
    const workDate = new Date(dateStr(jstNow()));
    const schedule = await this.prisma.schedule.findUnique({
      where: { userId_planDate: { userId, planDate: workDate } },
      include: { details: true },
    });
    const meal = await this.prisma.meal.findUnique({
      where: { userId_mealDate: { userId, mealDate: workDate } },
    });
    // 承認済みの予約/喫食のみ打刻画面に出す（承認待ち・取消・却下は出さない）
    const mealInfo =
      meal &&
      meal.approvalStatus === 'approved' &&
      (meal.status === 'reserved' || meal.status === 'eaten')
        ? { status: meal.status }
        : null;
    return {
      planIn: schedule?.planIn ?? null,
      planOut: schedule?.planOut ?? null,
      status: schedule?.status ?? null,
      breaks: (schedule?.details ?? [])
        .filter((d) => d.eventType === 'break_out')
        .map((d) => ({
          plannedOut: d.plannedOut,
          plannedIn: d.plannedIn,
          note: d.note,
        })),
      meal: mealInfo as null | { status: string },
    };
  }

  /**
   * 次回の通所予定（今日より後の、直近の承認済み予定）。退所打刻画面に出す。
   * 予定・中抜け・食事予約(あり/なし)・実習先を返す。無ければ null。
   */
  async getNextVisit(userId: string) {
    const today = new Date(dateStr(jstNow()));
    const schedule = await this.prisma.schedule.findFirst({
      where: { userId, status: 'approved', planDate: { gt: today } },
      orderBy: { planDate: 'asc' },
      include: { details: true },
    });
    if (!schedule) return null;
    const meal = await this.prisma.meal.findUnique({
      where: { userId_mealDate: { userId, mealDate: schedule.planDate } },
    });
    const mealReserved =
      !!meal &&
      meal.approvalStatus === 'approved' &&
      (meal.status === 'reserved' || meal.status === 'eaten');
    const details = schedule.details ?? [];
    return {
      date: dateStr(schedule.planDate),
      planIn: schedule.planIn ?? null,
      planOut: schedule.planOut ?? null,
      breaks: details
        .filter((d) => d.eventType === 'break_out')
        .map((d) => ({
          plannedOut: d.plannedOut,
          plannedIn: d.plannedIn,
          note: d.note,
        })),
      practicePlace:
        details.find((d) => d.eventType === 'practice')?.note ?? null,
      mealReserved,
    };
  }

  /** 打刻画面から本人が喫食を記録/取消（本日の承認済み予約のみ対象） */
  async recordMealEaten(userId: string, eaten: boolean) {
    const workDate = new Date(dateStr(jstNow()));
    const meal = await this.prisma.meal.findUnique({
      where: { userId_mealDate: { userId, mealDate: workDate } },
    });
    if (
      !meal ||
      meal.approvalStatus !== 'approved' ||
      (meal.status !== 'reserved' && meal.status !== 'eaten')
    ) {
      throw new BadRequestException('本日の食事予約がありません');
    }
    await this.prisma.meal.update({
      where: { id: meal.id },
      data: { status: eaten ? 'eaten' : 'reserved', updatedBy: userId },
    });
    return { status: eaten ? 'eaten' : 'reserved' };
  }

  /** 打刻画面に出すアラート（差戻・理由未入力） */
  async getAlerts(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { corporationId: true, facilityId: true },
    });
    if (!user) return { rejected: [], reasonNeeded: [] };

    const today = new Date(dateStr(jstNow()));

    // 差戻（却下された申請）。却下理由も返し、本人が理由を見られるようにする。
    const rejected = await this.prisma.schedule.findMany({
      where: { userId, status: 'rejected' },
      orderBy: { planDate: 'desc' },
      take: 20,
      select: { id: true, planDate: true, rejectReason: true },
    });

    // 過去の承認済み予定で打刻が無い日 → 欠席レコードを用意（遅延生成）
    const pastApproved = await this.prisma.schedule.findMany({
      where: { userId, status: 'approved', planDate: { lt: today } },
      orderBy: { planDate: 'desc' },
      take: 60,
      select: { planDate: true },
    });
    // N+1回避: 対象日の既存打刻をまとめて取得し、作成/更新もバッチで行う。
    const existingForPast = await this.prisma.attendance.findMany({
      where: { userId, workDate: { in: pastApproved.map((s) => s.planDate) } },
    });
    const pastAttByTime = new Map(
      existingForPast.map((a) => [a.workDate.getTime(), a]),
    );
    const toCreateAbsent: Prisma.AttendanceCreateManyInput[] = [];
    const toMarkAbsentIds: string[] = [];
    for (const s of pastApproved) {
      const att = pastAttByTime.get(s.planDate.getTime());
      if (!att) {
        toCreateAbsent.push({
          corporationId: user.corporationId,
          facilityId: user.facilityId,
          userId,
          workDate: s.planDate,
          status: 'absent',
          createdBy: userId,
        });
      } else if (!att.clockIn && att.status !== 'absent') {
        toMarkAbsentIds.push(att.id);
      }
    }
    if (toCreateAbsent.length) {
      await this.prisma.attendance.createMany({
        data: toCreateAbsent,
        skipDuplicates: true,
      });
    }
    if (toMarkAbsentIds.length) {
      await this.prisma.attendance.updateMany({
        where: { id: { in: toMarkAbsentIds } },
        data: { status: 'absent' },
      });
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
      rejected: rejected.map((r) => ({
        date: dateStr(r.planDate),
        reason: r.rejectReason,
      })),
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

      const isLate =
        schedule.status === 'approved'
          ? isLateArrival(schedule.planIn, nowMin, settings.lateGraceMinutes)
          : false;

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

    const isEarlyLeave =
      schedule && schedule.status === 'approved'
        ? isEarlyDeparture(
            schedule.planOut,
            nowMin,
            settings.earlyLeaveGraceMinutes,
          )
        : false;
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
