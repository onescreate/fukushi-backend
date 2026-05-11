const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
// ★修正：Cloud Runは環境変数 PORT で指定されたポートで起動します（デフォルト8080）
const port = process.env.PORT || 8080;

// ★修正：CORS設定（本番環境ではVercelのURLのみを許可し、それ以外からの攻撃を弾く）
const allowedOrigins = [
  'http://localhost:5173',  // ローカル開発環境のURL
  process.env.FRONTEND_URL  // Vercelデプロイ後のURL（Google Cloudの環境変数で設定します）
];

app.use(cors({
  origin: function (origin, callback) {
    // originがundefined（同一サーバー内からのアクセスなど）または許可リストに含まれる場合は許可
    if (!origin || allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORSエラー: 許可されていないドメインからのアクセスです'));
    }
  },
  credentials: true
}));

app.use(express.json());

// 各機能のファイルを読み込む
const setupRoutes = require('./routes/setup');
const authRoutes = require('./routes/auth');

// URLの割り当て（すべて /api から始まるように設定）
app.use('/api', setupRoutes);
app.use('/api', authRoutes);

// ★修正：Cloud Runで確実に外部からアクセスを受け付けるために '0.0.0.0' を指定する
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on port ${port}`);
});