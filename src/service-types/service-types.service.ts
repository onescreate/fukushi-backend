import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** サービス種別マスタ（管理者が自由に追加・編集）。 */
@Injectable()
export class ServiceTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.serviceTypeOption.findMany({
      where: { active: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async create(name: string) {
    const trimmed = name.trim();
    if (!trimmed) throw new BadRequestException('名称を入力してください');
    const max = await this.prisma.serviceTypeOption.aggregate({
      _max: { sortOrder: true },
    });
    try {
      return await this.prisma.serviceTypeOption.create({
        data: { name: trimmed, sortOrder: (max._max.sortOrder ?? 0) + 1 },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('同じ名称の種別が既にあります');
      }
      throw e;
    }
  }

  async update(id: string, data: { name?: string; sortOrder?: number }) {
    const patch: { name?: string; sortOrder?: number } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.sortOrder !== undefined) patch.sortOrder = data.sortOrder;
    try {
      return await this.prisma.serviceTypeOption.update({
        where: { id },
        data: patch,
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new BadRequestException('同じ名称の種別が既にあります');
      }
      throw e;
    }
  }

  /** 論理削除（active=false）。既に事業所で使われている値の表示は保持される。 */
  async remove(id: string) {
    await this.prisma.serviceTypeOption.update({
      where: { id },
      data: { active: false },
    });
    return { ok: true };
  }
}
