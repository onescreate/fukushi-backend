import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from '../auth/principal.types';
import {
  ALL_FACILITIES,
  resolveFacilityIds,
} from '../common/facility-scope';
import { SaveClosingOperationDto } from './dto/closing-operation.dto';
import { jstHHMM } from '../common/date';

@Injectable()
export class ClosingOperationsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 店舗×日の実績記録（加算）一覧。予定のある利用者ごとに、
   * 予定/打刻時間・食事提供加算(喫食実績から導出)・手入力の加算を返す。
   */
  async list(principal: Principal, facilityId: string, date: string) {
    const facilityIds = await resolveFacilityIds(
      this.prisma,
      principal,
      facilityId,
    );
    const allMode = facilityId === ALL_FACILITIES;
    const facMap = new Map(
      (
        await this.prisma.facility.findMany({
          where: { id: { in: facilityIds } },
          select: { id: true, name: true },
        })
      ).map((f) => [f.id, f.name]),
    );
    const day = new Date(date);

    const schedules = await this.prisma.schedule.findMany({
      where: { facilityId: { in: facilityIds }, planDate: day, status: 'approved' },
      include: { user: { select: { lastName: true, firstName: true } } },
    });
    const [attendances, meals, ops] = await Promise.all([
      this.prisma.attendance.findMany({
        where: { facilityId: { in: facilityIds }, workDate: day },
      }),
      this.prisma.meal.findMany({
        where: {
          facilityId: { in: facilityIds },
          mealDate: day,
          approvalStatus: 'approved',
          status: 'eaten',
        },
        select: { userId: true },
      }),
      this.prisma.closingOperation.findMany({
        where: { facilityId: { in: facilityIds }, targetDate: day },
      }),
    ]);
    const attByUser = new Map(attendances.map((a) => [a.userId, a]));
    const mealSet = new Set(meals.map((m) => m.userId));
    const opByUser = new Map(ops.map((o) => [o.userId, o]));
    const schedByUser = new Map(schedules.map((s) => [s.userId, s]));

    // 対象＝承認済み予定者（欠席含む） ∪ 打刻ありの人（通所予定なしで通所した人も含める）
    const clockedInIds = attendances
      .filter((a) => a.clockIn)
      .map((a) => a.userId);
    const userIds = [...new Set([...schedByUser.keys(), ...clockedInIds])];

    // 予定に無い（＝氏名が取れていない）打刻ユーザーの氏名・店舗を補完
    const missingIds = userIds.filter((id) => !schedByUser.has(id));
    const extraUsers = missingIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: missingIds } },
          select: { id: true, lastName: true, firstName: true, facilityId: true },
        })
      : [];
    const extraMap = new Map(extraUsers.map((u) => [u.id, u]));

    const toHHMM = (d: Date | null) => (d ? jstHHMM(d) : null);

    const rows = userIds.map((id) => {
      const s = schedByUser.get(id);
      const a = attByUser.get(id);
      const op = opByUser.get(id);
      const eu = extraMap.get(id);
      const facilityId = s?.facilityId ?? eu?.facilityId ?? '';
      const userName = s
        ? `${s.user.lastName} ${s.user.firstName}`
        : eu
          ? `${eu.lastName} ${eu.firstName}`
          : '—';
      const clockedIn = !!a?.clockIn;
      // 明示的な欠席、または「予定があるのに打刻が無い」→ 欠席
      const isAbsent = a?.status === 'absent' || (!!s && !clockedIn);
      return {
        userId: id,
        userName,
        facilityName: allMode ? (facMap.get(facilityId) ?? '') : null,
        planIn: s?.planIn ?? null,
        planOut: s?.planOut ?? null,
        actIn: toHHMM(a?.clockIn ?? null),
        actOut: toHHMM(a?.clockOut ?? null),
        isAbsent,
        noSchedule: !s, // 通所予定なしで打刻あり（参考表示）
        mealProvided: mealSet.has(id), // 食事提供加算（喫食から自動）
        regionalCooperation: op?.regionalCooperation ?? false,
        transitionPrep: op?.transitionPrep ?? false,
        absenceHandling: op?.absenceHandling ?? false,
      };
    });
    rows.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    // 当日通所人数＝実際に打刻（通所）した人数
    return { date, allMode, rows, attendeeCount: clockedInIds.length };
  }

  async save(
    principal: Principal,
    userId: string,
    date: string,
    dto: SaveClosingOperationDto,
  ) {
    const facilityIds = await resolveFacilityIds(
      this.prisma,
      principal,
      ALL_FACILITIES,
    );
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { corporationId: true, facilityId: true },
    });
    if (!user) throw new BadRequestException('利用者が見つかりません');
    if (!facilityIds.includes(user.facilityId)) {
      throw new ForbiddenException('この利用者を操作する権限がありません');
    }
    const staffId = principal.type === 'staff' ? principal.id : null;
    await this.prisma.closingOperation.upsert({
      where: { userId_targetDate: { userId, targetDate: new Date(date) } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId,
        targetDate: new Date(date),
        regionalCooperation: dto.regionalCooperation,
        transitionPrep: dto.transitionPrep,
        absenceHandling: dto.absenceHandling,
        createdBy: staffId,
        updatedBy: staffId,
      },
      update: {
        regionalCooperation: dto.regionalCooperation,
        transitionPrep: dto.transitionPrep,
        absenceHandling: dto.absenceHandling,
        updatedBy: staffId,
      },
    });
    return { ok: true };
  }
}
