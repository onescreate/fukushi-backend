const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const app = express();

// JSONを受け取る設定と、CORS（フロントからの通信許可）の設定
app.use(express.json());
app.use(cors());

// ちゃんと動いているか確認するためのテストAPI
app.get('/api/test', async (req, res) => {
  try {
    // 試しに店舗マスタの中身を検索してみる（今は空っぽなので空の配列が返れば大成功）
    const result = await pool.query('SELECT * FROM fukushi_stores');
    res.json({ success: true, message: 'DB接続大成功！', data: result.rows });
  } catch (error) {
    console.error('DB接続エラー:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// サーバーを起動する
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`サーバーがポート ${PORT} で起動しました！`);
});