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
import {
  ALL_FACILITIES,
  resolveFacilityIds,
} from '../common/facility-scope';
import { UpsertHealthRecordDto } from './dto/health-record.dto';
import { pad, jstNow } from '../common/date';

/** BMI = 体重kg / (身長m)^2。小数第1位で丸める。 */
function computeBmi(weightKg: number | null, heightCm: number | null) {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

@Injectable()
export class HealthRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  /** 店舗×年月の健康記録一覧（利用者ごと・未入力も含む）。facilityId='all'で全店舗。 */
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
    const facMap = new Map(
      (
        await this.prisma.facility.findMany({
          where: { id: { in: facilityIds } },
          select: { id: true, name: true },
        })
      ).map((f) => [f.id, f.name]),
    );

    const users = await this.prisma.user.findMany({
      where: { facilityId: { in: facilityIds }, status: 'active' },
      select: {
        id: true,
        lastName: true,
        firstName: true,
        facilityId: true,
        heightCm: true,
      },
    });
    const recs = await this.prisma.healthRecord.findMany({
      where: { facilityId: { in: facilityIds }, year, month },
    });
    const recByUser = new Map(recs.map((r) => [r.userId, r]));

    const rows = users.map((u) => {
      const r = recByUser.get(u.id);
      const heightCm =
        r?.heightCm != null
          ? Number(r.heightCm)
          : u.heightCm != null
            ? Number(u.heightCm)
            : null;
      const weightKg = r?.weightKg != null ? Number(r.weightKg) : null;
      return {
        userId: u.id,
        userName: `${u.lastName} ${u.firstName}`,
        facilityName: allMode ? (facMap.get(u.facilityId) ?? '') : null,
        heightCm,
        weightKg,
        bmi: computeBmi(weightKg, heightCm),
        measuredOn: r?.measuredOn ? r.measuredOn.toISOString().slice(0, 10) : null,
        note: r?.note ?? null,
      };
    });
    rows.sort((a, b) => a.userName.localeCompare(b.userName, 'ja'));
    return { year, month, allMode, rows };
  }

  async upsert(
    principal: Principal,
    userId: string,
    year: number,
    month: number,
    dto: UpsertHealthRecordDto,
  ) {
    const scope = computeAccessScope(principal);
    const user = await this.prisma.user
      .findUnique({
        where: { id: userId },
        select: { id: true, corporationId: true, facilityId: true },
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
    const staffId = principal.type === 'staff' ? principal.id : null;
    await this.prisma.healthRecord.upsert({
      where: { userId_year_month: { userId, year, month } },
      create: {
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        userId,
        year,
        month,
        weightKg: dto.weightKg ?? null,
        heightCm: dto.heightCm ?? null,
        note: dto.note ?? null,
        measuredOn: dto.measuredOn ? new Date(dto.measuredOn) : null,
        createdBy: staffId,
        updatedBy: staffId,
      },
      update: {
        weightKg: dto.weightKg ?? null,
        heightCm: dto.heightCm ?? null,
        note: dto.note ?? null,
        measuredOn: dto.measuredOn ? new Date(dto.measuredOn) : null,
        updatedBy: staffId,
      },
    });
    return { ok: true };
  }

  /** 当月の健康未入力（測定なし）の人数。サイドバーバッジ用。 */
  async missingCount(principal: Principal) {
    const facilityIds = await resolveFacilityIds(
      this.prisma,
      principal,
      ALL_FACILITIES,
    );
    const jst = jstNow();
    const year = jst.getFullYear();
    const month = jst.getMonth() + 1;
    const [userCount, recs] = await Promise.all([
      this.prisma.user.count({
        where: { facilityId: { in: facilityIds }, status: 'active' },
      }),
      this.prisma.healthRecord.findMany({
        where: { facilityId: { in: facilityIds }, year, month },
        select: { weightKg: true },
      }),
    ]);
    const entered = recs.filter((r) => r.weightKg != null).length;
    return { count: Math.max(0, userCount - entered) };
  }
}
