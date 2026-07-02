import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 生存確認用エンドポイント（GET /health）。
   * サーバーが正しく起動・応答しているかを確認する。
   */
  @Get()
  check() {
    return {
      status: 'ok',
      service: 'fukushi-backend',
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * DB疎通確認（GET /health/db）。
   * アプリからデータベースへ接続できるかを確認する。
   */
  @Get('db')
  async checkDb() {
    await this.prisma.$queryRaw`SELECT 1`;
    const corporations = await this.prisma.corporation.count();
    const users = await this.prisma.user.count();
    return {
      status: 'ok',
      database: 'connected',
      counts: { corporations, users },
    };
  }
}
