import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 全APIに共通の入力バリデーションを適用（余計なプロパティは弾く）
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS: 環境変数の許可リストのみ許可（未設定ならローカル開発を許可）
  const origins = (process.env.CORS_ORIGINS ?? 'http://localhost:5173')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins, credentials: true });

  // Cloud Run は PORT 環境変数で待受ポートを指定する（デフォルト 8080）
  const port = Number(process.env.PORT) || 8080;
  await app.listen(port, '0.0.0.0');

  Logger.log(`Server is running on http://0.0.0.0:${port}`, 'Bootstrap');
}

void bootstrap();
