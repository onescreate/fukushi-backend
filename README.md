# fukushi-backend

就労支援施設 利用者管理システムの **バックエンド**（NestJS + Prisma + PostgreSQL）。

- 設計方針: `../fukushi-frontend/docs/01_システム設計書.md`
- デプロイ先: Google Cloud Run / DB: Cloud SQL(PostgreSQL)

## 必要なもの
- Node.js 24 系
- PostgreSQL（ローカル開発は Postgres.app 等）
- Firebase サービスアカウント鍵（`secrets/serviceAccount.json`）

## セットアップ
```bash
npm install

# 環境変数
cp .env.example .env   # DATABASE_URL / FIREBASE_* を設定

# DBスキーマ適用＆初期データ
npx prisma migrate dev
npx prisma db seed
```

## 開発
```bash
npm run start:dev   # 開発サーバー（自動リロード）
npm run build       # ビルド
```

- 生存確認: `GET /health`、DB疎通: `GET /health/db`
- 本人情報: `GET /me`（要 Firebase IDトークン）

## 重要
- `.env` と `secrets/`（サービスアカウント鍵）は**コミットしない**（.gitignore 済み）。
- スキーマ変更は必ず Prisma マイグレーションで行う（手動SQL・破壊的DDLは禁止）。
