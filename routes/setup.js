const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const pool = require('../db'); // さっき作ったdb.jsを呼び出す

// セットアップ/疎通確認系の保護（auth.js の verifySetupSecret と同じ仕組み）。
// 環境変数 SETUP_SECRET と一致する key が無ければ拒否。未設定なら完全ロック。
const verifySetupSecret = (req, res, next) => {
    const provided = req.query.key || req.headers['x-setup-key'];
    if (!process.env.SETUP_SECRET || provided !== process.env.SETUP_SECRET) {
        return res.status(403).json({ success: false, error: 'セキュリティ保護: この操作にはセットアップキーが必要です' });
    }
    next();
};

// 疎通確認テスト用（店舗情報を返すため保護）
router.get('/test', verifySetupSecret, async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fukushi_stores');
        res.json({ success: true, message: 'DB接続大成功！', data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// デモデータ作成用（保護）
router.get('/setup-demo', verifySetupSecret, async (req, res) => {
    try {
        const hashedAdminPass = await bcrypt.hash('password123', 10);
        const hashedUserPin = await bcrypt.hash('1234', 10);

        await pool.query(`
            INSERT INTO fukushi_stores (store_id, store_name, email, role) 
            VALUES ('store_001', 'テスト福祉施設', 'info@example.com', '店舗') 
            ON CONFLICT (store_id) DO NOTHING
        `);

        await pool.query(`
            INSERT INTO fukushi_admins (admin_id, store_id, last_name, first_name, email, password) 
            VALUES ('admin_001', 'store_001', '山田', '太郎', 'admin@example.com', $1) 
            ON CONFLICT (admin_id) DO NOTHING
        `, [hashedAdminPass]);

        await pool.query(`
            INSERT INTO fukushi_users (user_id, store_id, last_name, first_name, pin_code) 
            VALUES ('user_001', 'store_001', '佐藤', '花子', $1) 
            ON CONFLICT (user_id) DO NOTHING
        `, [hashedUserPin]);

        res.json({ success: true, message: 'テスト用データの作成が完了しました！' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;