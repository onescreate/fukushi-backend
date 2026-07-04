import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { FirebaseModule } from './firebase/firebase.module';
import { AuthModule } from './auth/auth.module';
import { AuthGuard } from './auth/auth.guard';
import { RbacGuard } from './auth/rbac.guard';
import { CorporationsModule } from './corporations/corporations.module';
import { FacilitiesModule } from './facilities/facilities.module';
import { StaffModule } from './staff/staff.module';
import { UsersModule } from './users/users.module';
import { SchedulesModule } from './schedules/schedules.module';
import { AttendanceModule } from './attendance/attendance.module';
import { MealsModule } from './meals/meals.module';
import { AnnouncementsModule } from './announcements/announcements.module';
import { KioskModule } from './kiosk/kiosk.module';
import { PostalModule } from './postal/postal.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    // .env を読み込み、全モジュールで環境変数を利用可能にする
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    FirebaseModule,
    AuthModule,
    CorporationsModule,
    FacilitiesModule,
    StaffModule,
    UsersModule,
    SchedulesModule,
    AttendanceModule,
    MealsModule,
    AnnouncementsModule,
    KioskModule,
    PostalModule,
    HealthModule,
  ],
  providers: [
    // 全エンドポイントに順に適用: ①認証 → ②権限
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RbacGuard },
  ],
})
export class AppModule {}
