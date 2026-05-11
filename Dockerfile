# 1. 実行環境として Node.js 20 を使用
FROM node:20-slim

# 2. アプリフォルダを作成
WORKDIR /app

# 3. 設定ファイルをコピーしてライブラリをインストール
COPY package*.json ./
RUN npm install --production

# 4. ソースコードをすべてコピー
COPY . .

# 5. サーバーを起動
CMD ["node", "index.js"]