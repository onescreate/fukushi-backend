import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceService } from '../attendance/attendance.service';
import {
  AccessScope,
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { CreateDeviceDto } from './dto/create-device.dto';

const MAX_ATTEMPTS = 5;
const LOCK_MS = 60_000;

function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

@Injectable()
export class KioskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attendance: AttendanceService,
  ) {}

  // PIN試行回数の簡易制限（利用者ID単位・メモリ内）
  private attempts = new Map<string, { count: number; until: number }>();

  // ---------- 端末管理（管理者） ----------

  listDevices(principal: Principal) {
    const scope = computeAccessScope(principal);
    let where: Prisma.KioskDeviceWhereInput = {};
    if (!scope.crossTenant) {
      where = scope.allFacilitiesInCorporation
        ? { facility: { corporationId: scope.corporationId ?? '__none__' } }
        : { facilityId: { in: scope.facilityIds } };
    }
    return this.prisma.kioskDevice.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        label: true,
        facilityId: true,
        status: true,
        lastUsedAt: true,
        createdAt: true,
        facility: { select: { name: true } },
      },
    });
  }

  private async facilityInScope(scope: AccessScope, facilityId: string) {
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('その店舗には登録できません');
    }
    return facility;
  }

  async createDevice(principal: Principal, dto: CreateDeviceDto) {
    const scope = computeAccessScope(principal);
    const facility = await this.facilityInScope(scope, dto.facilityId);

    // 高エントロピーの生トークンを発行し、ハッシュだけ保存（生値は一度だけ返す）
    const rawToken = randomBytes(24).toString('base64url');
    const device = await this.prisma.kioskDevice.create({
      data: {
        facilityId: facility.id,
        label: dto.label,
        deviceToken: hashToken(rawToken),
        status: 'active',
      },
      select: { id: true, label: true, facilityId: true, status: true },
    });
    return { device, token: rawToken };
  }

  async removeDevice(principal: Principal, id: string) {
    const scope = computeAccessScope(principal);
    const device = await this.prisma.kioskDevice.findUnique({
      where: { id },
      include: { facility: true },
    });
    if (!device) throw new NotFoundException('端末が見つかりません');
    if (!canAccessFacility(scope, device.facility)) {
      throw new ForbiddenException('この端末を操作する権限がありません');
    }
    await this.prisma.kioskDevice.delete({ where: { id } });
    return { ok: true };
  }

  // ---------- キオスク（公開・端末トークンで認証） ----------

  private async deviceByToken(deviceToken: string) {
    const device = await this.prisma.kioskDevice.findUnique({
      where: { deviceToken: hashToken(deviceToken ?? '') },
    });
    if (!device || device.status !== 'active') {
      throw new UnauthorizedException('この端末は登録されていません');
    }
    return device;
  }

  /** タブレットのPIN選択画面に出す、その店舗の利用者一覧 */
  async kioskUsers(deviceToken: string) {
    const device = await this.deviceByToken(deviceToken);
    const users = await this.prisma.user.findMany({
      where: { facilityId: device.facilityId, status: 'active' },
      select: { id: true, lastName: true, firstName: true, loginId: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
    return {
      facility: { id: device.facilityId },
      users: users.map((u) => ({
        id: u.id,
        loginId: u.loginId,
        name: `${u.lastName} ${u.firstName}`,
      })),
    };
  }

  /** PIN認証。成功で短命の操作トークンを返す（実際の打刻はPhase 2）。 */
  async authenticate(deviceToken: string, userId: string, pin: string) {
    const device = await this.deviceByToken(deviceToken);

    // 試行回数の制限（ロック中は弾く）
    const lock = this.attempts.get(userId);
    if (lock && lock.until > Date.now()) {
      throw new UnauthorizedException(
        'PINの入力回数が上限を超えました。しばらく待ってから再度お試しください。',
      );
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, facilityId: device.facilityId, status: 'active' },
      select: { id: true, pinCode: true, lastName: true, firstName: true },
    });

    const ok = user ? await bcrypt.compare(pin, user.pinCode) : false;
    if (!user || !ok) {
      this.recordFailure(userId);
      throw new UnauthorizedException('PINが正しくありません');
    }

    this.attempts.delete(userId);
    void this.prisma.kioskDevice
      .update({ where: { id: device.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);

    const secret = process.env.KIOSK_TOKEN_SECRET ?? '';
    const operationToken = jwt.sign(
      { sub: user.id, facilityId: device.facilityId, scope: 'kiosk' },
      secret,
      { expiresIn: '5m' },
    );

    const todayStatus = await this.attendance.getTodayStatus(user.id);
    return {
      operationToken,
      user: { id: user.id, name: `${user.lastName} ${user.firstName}` },
      attendance: todayStatus,
    };
  }

  /** 操作トークンを検証して利用者IDを取り出す */
  private verifyOperationToken(token: string): string {
    try {
      const payload = jwt.verify(
        token,
        process.env.KIOSK_TOKEN_SECRET ?? '',
      ) as jwt.JwtPayload;
      if (payload.scope !== 'kiosk' || typeof payload.sub !== 'string') {
        throw new Error('invalid');
      }
      return payload.sub;
    } catch {
      throw new UnauthorizedException('操作トークンが無効か、期限が切れています');
    }
  }

  /** 通所/退所の打刻（PIN認証で得た操作トークンが必要） */
  async clock(operationToken: string, type: 'in' | 'out') {
    const userId = this.verifyOperationToken(operationToken);
    return this.attendance.recordClock(userId, type);
  }

  /** 打刻画面に出す情報（今日の予定・中抜け・アラート） */
  async board(operationToken: string) {
    const userId = this.verifyOperationToken(operationToken);
    const [today, alerts] = await Promise.all([
      this.attendance.getTodayInfo(userId),
      this.attendance.getAlerts(userId),
    ]);
    return { today, alerts };
  }

  /** 打刻画面から本人が喫食を記録/取消 */
  async recordMeal(operationToken: string, eaten: boolean) {
    const userId = this.verifyOperationToken(operationToken);
    return this.attendance.recordMealEaten(userId, eaten);
  }

  /** 欠席・遅刻・早退の理由入力 */
  async submitReason(
    operationToken: string,
    date: string,
    kind: 'absence' | 'late' | 'early',
    reason: string,
  ) {
    const userId = this.verifyOperationToken(operationToken);
    return this.attendance.submitReason(userId, date, kind, reason);
  }

  private recordFailure(userId: string) {
    const cur = this.attempts.get(userId);
    const count = (cur?.count ?? 0) + 1;
    this.attempts.set(userId, {
      count,
      until: count >= MAX_ATTEMPTS ? Date.now() + LOCK_MS : 0,
    });
  }
}
