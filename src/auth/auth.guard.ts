import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { Principal } from './principal.types';
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
  constructor(
    private readonly firebase: FirebaseService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
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
    try {
      const decoded = await this.firebase.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      throw new UnauthorizedException('認証トークンが無効です');
    }

    const principal = await this.resolvePrincipal(uid);
    if (!principal) {
      throw new ForbiddenException('このアカウントはシステムに登録されていません');
    }

    req.principal = principal;
    return true;
  }

  /** firebase_uid から職員 or 利用者のレコードを引いて principal を組み立てる。 */
  private async resolvePrincipal(firebaseUid: string): Promise<Principal | null> {
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

    return null;
  }
}
