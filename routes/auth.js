const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

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
        res.status(500).json({ success: false, message: 'サーバーエラー' });
    }
});

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
        res.status(500).json({ success: false, message: 'サーバーエラー' });
    }
});

router.get('/users', async (req, res) => {
    try {
        const result = await pool.query('SELECT user_id, last_name, first_name FROM fukushi_users ORDER BY user_id ASC');
        res.json({ success: true, users: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'サーバーエラー' });
    }
});

// --- 打刻関連 ---

const createAttendanceTable = `
    CREATE TABLE IF NOT EXISTS fukushi_attendance (
        id SERIAL PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        stamp_type VARCHAR(10) NOT NULL,
        stamp_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`;
pool.query(createAttendanceTable).catch(err => console.error("テーブル作成エラー:", err));

router.post('/user/stamp', async (req, res) => {
    const { user_id, stamp_type } = req.body;
    try {
        await pool.query(
            'INSERT INTO fukushi_attendance (user_id, stamp_type, stamp_time) VALUES ($1, $2, NOW())',
            [user_id, stamp_type]
        );
        res.json({ success: true, message: '打刻を正常に記録しました' });
    } catch (err) {
        console.error("打刻エラー:", err);
        res.status(500).json({ success: false, message: 'サーバーエラー' });
    }
});

// ====================================================
// ★ 新規追加：管理者向けに「全員の打刻記録」を返すAPI
// ====================================================
router.get('/admin/attendance', async (req, res) => {
    try {
        // JOIN句を使って、打刻データ（fukushi_attendance）と名前（fukushi_users）を結合し、最新順に並べて取得します
        const query = `
            SELECT 
                a.id, 
                a.stamp_type, 
                a.stamp_time, 
                u.last_name, 
                u.first_name 
            FROM fukushi_attendance a
            JOIN fukushi_users u ON a.user_id = u.user_id
            ORDER BY a.stamp_time DESC
        `;
        const result = await pool.query(query);
        res.json({ success: true, records: result.rows });
    } catch (err) {
        console.error("記録取得エラー:", err);
        res.status(500).json({ success: false, message: 'サーバーエラーが発生しました' });
    }
});

// ====================================================
// ★ 新機能：予定・中抜け・食事管理システムのテーブル自動構築
// ====================================================

const createAdvancedTables = `
    -- 1. 予定管理テーブル（タイムカード・予定）
    CREATE TABLE IF NOT EXISTS fukushi_schedules (
        plan_id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        plan_date DATE NOT NULL,
        plan_in TIME,
        plan_out TIME,
        act_in TIME,
        act_out TIME,
        status VARCHAR(20) DEFAULT '承認待ち',
        note TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 2. 予定詳細テーブル（中抜け管理）
    CREATE TABLE IF NOT EXISTS fukushi_schedule_details (
        detail_id VARCHAR(50) PRIMARY KEY,
        plan_id VARCHAR(50) REFERENCES fukushi_schedules(plan_id) ON DELETE CASCADE,
        event_type VARCHAR(50),
        event_detail VARCHAR(100),
        time_out TIME,
        time_in TIME,
        status VARCHAR(20) DEFAULT '承認待ち',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 3. 食事予約・実績テーブル
    CREATE TABLE IF NOT EXISTS fukushi_meals (
        meal_id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        meal_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT '予約', -- '予約', '取消', 'キャンセル'
        amount INTEGER DEFAULT 300,
        situation VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- 4. システム設定テーブル
    CREATE TABLE IF NOT EXISTS fukushi_system_settings (
        setting_key VARCHAR(50) PRIMARY KEY,
        setting_value INTEGER NOT NULL
    );

    -- 初期設定値の挿入（存在しない場合のみ）
    INSERT INTO fukushi_system_settings (setting_key, setting_value) 
    VALUES ('cancel_fee', 500), ('revoke_fee', 0), ('meal_fee', 300)
    ON CONFLICT (setting_key) DO NOTHING;
`;

pool.query(createAdvancedTables)
    .then(() => console.log("高度なスケジュール管理テーブルの作成完了"))
    .catch(err => console.error("テーブル作成エラー:", err));

module.exports = router;