const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// 管理者ログインAPI
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM fukushi_admins WHERE email = $1', [email]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'メールアドレスまたはパスワードが違います' });
        }
        
        const admin = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) {
            return res.status(401).json({ success: false, message: 'メールアドレスまたはパスワードが違います' });
        }

        const token = jwt.sign({ id: admin.admin_id, role: 'admin' }, process.env.JWT_SECRET, { expiresIn: '24h' });
        res.json({ success: true, token, admin: { id: admin.admin_id, name: `${admin.last_name} ${admin.first_name}` } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// 利用者ログインAPI
router.post('/user/login', async (req, res) => {
    const { user_id, pin_code } = req.body;
    try {
        const result = await pool.query('SELECT * FROM fukushi_users WHERE user_id = $1', [user_id]);
        if (result.rows.length === 0) {
            return res.status(401).json({ success: false, message: 'ユーザーが見つかりません' });
        }
        
        const user = result.rows[0];
        const isValidPin = await bcrypt.compare(pin_code, user.pin_code);
        if (!isValidPin) {
            return res.status(401).json({ success: false, message: 'PINコードが違います' });
        }

        const token = jwt.sign({ id: user.user_id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '12h' });
        res.json({ success: true, token, user: { id: user.user_id, name: `${user.last_name} ${user.first_name}` } });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// 利用者の一覧を取得するAPI
router.get('/users', async (req, res) => {
    try {
        const result = await pool.query(
            'SELECT user_id, last_name, first_name FROM fukushi_users ORDER BY user_id ASC'
        );
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// ====================================================
// ★ 新規追加：打刻データをデータベースに保存する機能
// ====================================================

// 1. プロ仕様の自動テーブル作成（Auto Migration）
// ※サーバーが起動した際、打刻記録用のテーブルが無ければ自動で構築します
const createAttendanceTable = `
    CREATE TABLE IF NOT EXISTS fukushi_attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        stamp_type VARCHAR(10) NOT NULL, -- 'in'(通所) または 'out'(退所)
        stamp_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;
pool.query(createAttendanceTable).catch(err => console.error("テーブル作成エラー:", err));

// 2. 打刻を受け取るAPI
router.post('/user/stamp', async (req, res) => {
    // 画面から「誰が（user_id）」「どちらを押したか（stamp_type）」を受け取る
    const { user_id, stamp_type } = req.body;
    try {
        // データベースに記録を挿入（時間はデータベースの現在時刻 NOW() を使って正確に記録します）
        await pool.query(
            'INSERT INTO fukushi_attendance (user_id, stamp_type, stamp_time) VALUES ($1, $2, NOW())',
            [user_id, stamp_type]
        );
        res.json({ success: true, message: '打刻を正常に記録しました' });
    } catch (err) {
        console.error("打刻エラー:", err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

module.exports = router;