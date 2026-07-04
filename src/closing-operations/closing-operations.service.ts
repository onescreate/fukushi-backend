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

    const toHHMM = (d: Date | null) =>
      d
        ? new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
            .toTimeString()
            .slice(0, 5)
        : null;

    const rows = schedules.map((s) => {
      const a = attByUser.get(s.userId);
      const op = opByUser.get(s.userId);
      return {
        userId: s.userId,
        userName: `${s.user.lastName} ${s.user.firstName}`,
        facilityName: allMode ? (facMap.get(s.facilityId) ?? '') : null,
        planIn: s.planIn,
        planOut: s.planOut,
        actIn: toHHMM(a?.clockIn ?? null),
        actOut: toHHMM(a?.clockOut ?? null),
        isAbsent: a?.status === 'absent',
        mealProvided: mealSet.has(s.userId), // 食事提供加算
        regionalCooperation: op?.regionalCooperation ?? false,
        transitionPrep: op?.transitionPrep ?? false,
        absenceHandling: op?.absenceHandling ?? false,
      };
    });
    rows.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    return { date, allMode, rows };
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
