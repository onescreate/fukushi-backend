import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';

// 認証・権限ガードは AppModule で全体適用（APP_GUARD）している。
@Module({
  controllers: [AuthController],
})
export class AuthModule {}
