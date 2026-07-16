import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../auth/public.decorator';

@Public()
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
   * ※ 生存確認は @Public のため、テナント件数などの情報は返さない（情報漏えい防止・軽量化）。
   */
  @Get('db')
  async checkDb() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      database: 'connected',
    };
  }
}
