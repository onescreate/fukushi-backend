const { Pool } = require('pg');

// 環境変数から設定を読み込む
const isProduction = process.env.NODE_ENV === 'production';

const pool = new Pool({
  user: process.env.DB_USER,          // DBユーザー名
  host: isProduction ? `/cloudsql/${process.env.INSTANCE_CONNECTION_NAME}` : process.env.DB_HOST, 
  database: process.env.DB_NAME,      // データベース名
  password: process.env.DB_PASSWORD,  // パスワード
  port: process.env.DB_PORT || 5432,
});

// 接続確認ログ（本番ではエラー時のみ）
pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

module.exports = pool;