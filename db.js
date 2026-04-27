const { Pool } = require('pg');
require('dotenv').config();

// 基本となる接続設定（ご指定のルールを完全適用）
const poolConfig = {
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  max: 5, // コネクション枯渇を防ぐための制限
};

// 本番環境（Cloud Run）の場合はUnixソケットを使用
if (process.env.INSTANCE_UNIX_SOCKET) {
  // Cloud RunからのUnixドメインソケット接続
  // ※トンネルが暗号化されているため ssl や port の指定は絶対にしない
  poolConfig.host = `/cloudsql/${process.env.INSTANCE_UNIX_SOCKET}`;
} else {
  // ローカル開発環境（ご自身のPC）から接続する場合（Cloud SQL Auth Proxy等を使用）
  poolConfig.host = '127.0.0.1';
  poolConfig.port = 5432;
}

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('データベースで予期せぬエラーが発生しました:', err);
});

module.exports = pool;