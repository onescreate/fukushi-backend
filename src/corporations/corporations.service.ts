import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCorporationDto } from './dto/create-corporation.dto';
import { UpdateCorporationDto } from './dto/update-corporation.dto';

@Injectable()
export class CorporationsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.corporation.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: { select: { facilities: true, users: true, staff: true } },
      },
    });
  }

  async get(id: string) {
    const corp = await this.prisma.corporation.findUnique({ where: { id } });
    if (!corp) throw new NotFoundException('法人が見つかりません');
    return corp;
  }

  create(dto: CreateCorporationDto) {
    return this.prisma.corporation.create({
      data: { name: dto.name, status: dto.status ?? 'active' },
    });
  }

  async update(id: string, dto: UpdateCorporationDto) {
    await this.get(id);
    return this.prisma.corporation.update({
      where: { id },
      data: { name: dto.name, status: dto.status },
    });
  }

  async remove(id: string) {
    const corp = await this.prisma.corporation.findUnique({
      where: { id },
      include: { _count: { select: { facilities: true } } },
    });
    if (!corp) throw new NotFoundException('法人が見つかりません');
    if (corp._count.facilities > 0) {
      throw new BadRequestException(
        '店舗が登録されているため削除できません。先に店舗を削除してください。',
      );
    }
    await this.prisma.corporation.delete({ where: { id } });
    return { ok: true };
  }
}
