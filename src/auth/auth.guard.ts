import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { createHash } from 'crypto';
import { Role } from '@prisma/client';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PortalService, type PortalUser } from '../portal/portal.service';
import {
  Principal,
  StaffPrincipal,
  FacilityRoleScope,
} from './principal.types';
import { IS_PUBLIC_KEY } from './public.decorator';

/** principal を付与したリクエスト型 */
export type AuthedRequest = Request & { principal?: Principal };

/**
 * AuthGuard: FirebaseのIDトークンを検証し、DBから実行主体(principal)を解決する。
 * - トークンが無い/無効 → 401
 * - Firebase認証は通ったが本システムに未登録 → 403
 * 解決した principal は req.principal に格納し、後続で利用する。
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private static readonly ADMIN_ROLES = [
    'super_admin',
    'admin',
    '全権管理者',
    '本部管理者',
    '管理者',
  ];
  private static readonly SUPER_ROLES = ['super_admin', '全権管理者'];

  constructor(
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly portal: PortalService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // @Public() が付いたエンドポイントは認証をスキップ
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();

    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('認証トークンがありません');
    }
    const idToken = authHeader.slice('Bearer '.length).trim();

    let uid: string;
    let email: string | undefined;
    try {
      const decoded = await this.firebase.verifyIdToken(idToken);
      uid = decoded.uid;
      email = decoded.email;
    } catch {
      throw new UnauthorizedException('認証トークンが無効です');
    }

    const principal = await this.resolvePrincipal(uid, email);
    if (!principal) {
      throw new ForbiddenException('このアカウントはシステムに登録されていません');
    }

    req.principal = principal;
    return true;
  }

  /** firebase_uid(福祉)→職員/利用者、無ければ email でポータルユーザーを照合して principal を組み立てる。 */
  private async resolvePrincipal(
    firebaseUid: string,
    email?: string,
  ): Promise<Principal | null> {
    const staff = await this.prisma.staff.findUnique({
      where: { firebaseUid },
      include: { facilityRoles: true },
    });
    if (staff) {
      return {
        type: 'staff',
        id: staff.id,
        firebaseUid,
        corporationId: staff.corporationId,
        email: staff.email,
        name: `${staff.lastName} ${staff.firstName}`,
        roles: staff.facilityRoles.map((r) => ({
          facilityId: r.facilityId,
          role: r.role,
        })),
      };
    }

    const user = await this.prisma.user.findUnique({ where: { firebaseUid } });
    if (user) {
      return {
        type: 'user',
        id: user.id,
        firebaseUid,
        corporationId: user.corporationId,
        facilityId: user.facilityId,
        loginId: user.loginId,
        name: `${user.lastName} ${user.firstName}`,
      };
    }

    // 福祉に未登録なら、ポータル(会計)のユーザーをメールで照合（福祉権限がある場合のみ）
    if (email) {
      try {
        const pu = await this.portal.getUserByEmail(email);
        if (pu) return await this.buildPrincipalFromPortalUser(pu, firebaseUid);
      } catch {
        // ポータル未接続・権限未付与などは「未解決(=403)」として扱う
      }
    }

    return null;
  }

  /** ポータルユーザー→福祉の StaffPrincipal を構築（福祉権限が無ければ null）。 */
  private async buildPrincipalFromPortalUser(
    u: PortalUser,
    firebaseUid: string,
  ): Promise<StaffPrincipal | null> {
    if (!this.hasFukushiAccess(u)) return null;

    const isAdmin = AuthGuard.ADMIN_ROLES.includes(u.role ?? '');
    let roles: FacilityRoleScope[];
    let corporationId = '';

    if (isAdmin) {
      // 会計の管理者 → 福祉は全権(全店舗)
      roles = [{ facilityId: null, role: Role.system_admin }];
    } else {
      // それ以外 → 所属店舗が福祉事業所に指定されていればそこにスコープ
      let facilityId: string | null = null;
      if (u.shopId) {
        const fac = await this.prisma.facility.findUnique({
          where: { externalShopId: u.shopId },
          select: { id: true, corporationId: true, status: true },
        });
        if (fac && fac.status === 'active') {
          facilityId = fac.id;
          corporationId = fac.corporationId;
        }
      }
      roles = facilityId
        ? [{ facilityId, role: Role.facility_admin }]
        : [];
    }

    return {
      type: 'staff',
      id: this.deterministicUuid('portal-user:' + u.id),
      firebaseUid,
      corporationId,
      email: u.email,
      name: u.name ?? u.email,
      roles,
    };
  }

  /** 福祉アクセス可否：system_access.fukushi を優先、未設定は全権のみ（会計側 canAccessSystem と一致）。 */
  private hasFukushiAccess(u: PortalUser): boolean {
    const sa =
      typeof u.systemAccess === 'string'
        ? this.safeParse(u.systemAccess)
        : (u.systemAccess as Record<string, unknown> | null);
    if (sa && typeof sa.fukushi === 'boolean') return sa.fukushi;
    return AuthGuard.SUPER_ROLES.includes(u.role ?? '');
  }

  private safeParse(s: string): Record<string, unknown> | null {
    try {
      return JSON.parse(s) as Record<string, unknown>;
    } catch {
      return null;
    }
  }

  /** 監査列(@db.Uuid, FKなし)用に、ポータルユーザーIDから決定的なUUIDを生成。 */
  private deterministicUuid(seed: string): string {
    const h = createHash('sha1').update(seed).digest('hex');
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
  }
}
