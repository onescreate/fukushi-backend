# 福祉システム バックエンド (NestJS + Prisma) — Cloud Run 用イメージ
FROM node:20-slim

WORKDIR /app

# Prisma のクエリエンジンは OpenSSL を必要とする
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# 依存インストール（build に devDependencies が要るので全部入れる）
COPY package*.json ./
RUN npm ci

# ソースをコピーしてビルド（build = prisma generate && nest build）
COPY . .
RUN npm run build

ENV NODE_ENV=production
# Cloud Run は PORT 環境変数で待受ポートを渡す（main.ts が参照）
EXPOSE 8080

CMD ["node", "dist/main.js"]
