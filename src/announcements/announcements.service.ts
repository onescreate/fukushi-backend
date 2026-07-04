import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Announcement } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  canAccessFacility,
  computeAccessScope,
} from '../auth/access-scope';
import { Principal } from '../auth/principal.types';
import { UpsertAnnouncementDto } from './dto/announcement.dto';

@Injectable()
export class AnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertFacility(principal: Principal, facilityId: string) {
    const scope = computeAccessScope(principal);
    const facility = await this.prisma.facility
      .findUnique({ where: { id: facilityId } })
      .catch(() => null);
    if (!facility) throw new BadRequestException('店舗が存在しません');
    if (!canAccessFacility(scope, facility)) {
      throw new ForbiddenException('この店舗のお知らせを操作する権限がありません');
    }
    return facility;
  }

  private serialize(a: Announcement) {
    return {
      id: a.id,
      facilityId: a.facilityId,
      title: a.title,
      body: a.body,
      audience: a.audience,
      publishedOn: a.publishedOn.toISOString().slice(0, 10),
    };
  }

  /** 管理用: 店舗のお知らせ一覧（掲載日の新しい順）。 */
  async list(principal: Principal, facilityId: string) {
    await this.assertFacility(principal, facilityId);
    const rows = await this.prisma.announcement.findMany({
      where: { facilityId },
      orderBy: { publishedOn: 'desc' },
    });
    return rows.map((a) => this.serialize(a));
  }

  async create(
    principal: Principal,
    facilityId: string,
    dto: UpsertAnnouncementDto,
  ) {
    const facility = await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    await this.prisma.announcement.create({
      data: {
        corporationId: facility.corporationId,
        facilityId,
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        publishedOn: new Date(dto.publishedOn),
        createdBy: staffId,
        updatedBy: staffId,
      },
    });
    return this.list(principal, facilityId);
  }

  async update(
    principal: Principal,
    facilityId: string,
    id: string,
    dto: UpsertAnnouncementDto,
  ) {
    await this.assertFacility(principal, facilityId);
    const staffId = principal.type === 'staff' ? principal.id : null;
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('お知らせが見つかりません');
    }
    await this.prisma.announcement.update({
      where: { id },
      data: {
        title: dto.title,
        body: dto.body,
        audience: dto.audience,
        publishedOn: new Date(dto.publishedOn),
        updatedBy: staffId,
      },
    });
    return this.list(principal, facilityId);
  }

  async remove(principal: Principal, facilityId: string, id: string) {
    await this.assertFacility(principal, facilityId);
    const row = await this.prisma.announcement.findUnique({ where: { id } });
    if (!row || row.facilityId !== facilityId) {
      throw new NotFoundException('お知らせが見つかりません');
    }
    await this.prisma.announcement.delete({ where: { id } });
    return this.list(principal, facilityId);
  }

  /** 職員向けフィード（掲載済み・対象が staff/all）。 */
  async staffFeed(principal: Principal, facilityId: string) {
    await this.assertFacility(principal, facilityId);
    const today = new Date(new Date().toISOString().slice(0, 10));
    const rows = await this.prisma.announcement.findMany({
      where: {
        facilityId,
        publishedOn: { lte: today },
        audience: { in: ['staff', 'all'] },
      },
      orderBy: { publishedOn: 'desc' },
      take: 20,
    });
    return rows.map((a) => this.serialize(a));
  }

  /** 利用者向けフィード（自分の店舗・掲載済み・対象が users/all）。 */
  async userFeed(facilityId: string) {
    const today = new Date(new Date().toISOString().slice(0, 10));
    const rows = await this.prisma.announcement.findMany({
      where: {
        facilityId,
        publishedOn: { lte: today },
        audience: { in: ['users', 'all'] },
      },
      orderBy: { publishedOn: 'desc' },
      take: 20,
    });
    return rows.map((a) => this.serialize(a));
  }
}
