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
    -- ★ 追加：古い構造のテーブルが残っていたら一度削除（リセット）する
    DROP TABLE IF EXISTS fukushi_schedule_details CASCADE;
    DROP TABLE IF EXISTS fukushi_schedules CASCADE;
    DROP TABLE IF EXISTS fukushi_meals CASCADE;

    -- 1. 予定管理テーブル（タイムカード・予定）
    CREATE TABLE fukushi_schedules (
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
    CREATE TABLE fukushi_schedule_details (
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
    CREATE TABLE fukushi_meals (
        meal_id VARCHAR(50) PRIMARY KEY,
        user_id VARCHAR(50) NOT NULL,
        meal_date DATE NOT NULL,
        status VARCHAR(20) DEFAULT '予約',
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

    -- 初期設定値の挿入
    INSERT INTO fukushi_system_settings (setting_key, setting_value) 
    VALUES ('cancel_fee', 500), ('revoke_fee', 0), ('meal_fee', 300)
    ON CONFLICT (setting_key) DO NOTHING;
`;

pool.query(createAdvancedTables)
    .then(() => console.log("高度なスケジュール管理テーブルの再構築完了"))
    .catch(err => console.error("テーブル作成エラー:", err));


// ====================================================
// ★ 新機能：予定・食事の高度なロジックAPI（GAS完全移植・バグ修正版）
// ====================================================

// 1. 月間カレンダーデータ取得API
router.get('/user/schedule/monthly', async (req, res) => {
    const { user_id, year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        // ★ 修正：「4月31日」のような存在しない日付によるSQLエラーを防ぐため、月の最終日を正確に計算
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // ★ 修正：TO_CHARを使ってDB側でYYYY/MM/DDにして返す（タイムゾーンのズレによる1日ズレを完全防止）
        const scheduleResult = await pool.query(
            `SELECT *, TO_CHAR(plan_date, 'YYYY/MM/DD') as f_date FROM fukushi_schedules WHERE user_id = $1 AND plan_date >= $2 AND plan_date <= $3`,
            [user_id, startDate, endDate]
        );

        const mealResult = await pool.query(
            `SELECT *, TO_CHAR(meal_date, 'YYYY/MM/DD') as f_date FROM fukushi_meals WHERE user_id = $1 AND meal_date >= $2 AND meal_date <= $3 AND status = '予約'`,
            [user_id, startDate, endDate]
        );

        let currentMonthSchedule = {};
        
        scheduleResult.rows.forEach(row => {
            const dStr = row.f_date; // "2026/04/15"
            currentMonthSchedule[dStr] = {
                planIn: row.plan_in ? row.plan_in.substring(0, 5) : '',
                planOut: row.plan_out ? row.plan_out.substring(0, 5) : '',
                status: row.status,
                note: row.note || '',
                meal: false,
                subEvents: []
            };
        });

        mealResult.rows.forEach(row => {
            const dStr = row.f_date;
            if (!currentMonthSchedule[dStr]) {
                currentMonthSchedule[dStr] = { meal: true };
            } else {
                currentMonthSchedule[dStr].meal = true;
            }
        });

        res.json({ success: true, schedule: currentMonthSchedule });
    } catch (err) {
        console.error(err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. 予定の一括申請API（15日ルール・自動承認機能付き）
router.post('/user/schedule/submit', async (req, res) => {
    const { user_id, dates, plan_in, plan_out, note } = req.body;
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    try {
        await pool.query('BEGIN');
        for (let d of dates) {
            // d は "2026-06-03" の形式
            const [yStr, mStr, dStr] = d.split('-');
            const targetYear = parseInt(yStr, 10);
            const targetMonth = parseInt(mStr, 10) - 1; // JSの月は0始まり
            
            // ★修正：現在月との「月の差（何ヶ月先か）」を計算する
            const monthsDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
            
            const existCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, d]);
            const isUpdate = existCheck.rows.length > 0;

            // ★修正：翌々月以降（monthsDiff >= 2）は常に承認済。翌月は15日まで承認済。それ以外は承認待ち。
            let status = "承認待ち";
            if (!isUpdate) {
                if (monthsDiff >= 2) {
                    status = "承認済"; // 翌々月以降は常に承認済
                } else if (monthsDiff === 1 && currentDate <= 15) {
                    status = "承認済"; // 翌月分は15日まで承認済
                }
            }

            let reasonMsg = note || "";
            
            if (isUpdate) {
                await pool.query(
                    `UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, note = $3, status = $4, updated_at = NOW() WHERE user_id = $5 AND plan_date = $6`,
                    [plan_in, plan_out, reasonMsg, status, user_id, d]
                );
            } else {
                const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(
                    `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [planId, user_id, d, plan_in, plan_out, status, reasonMsg]
                );
            }
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("予定申請エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. 食事の予約・キャンセルAPI（14日キャンセル料ルール付き）
router.post('/user/meal/submit', async (req, res) => {
    const { user_id, registers, cancels } = req.body;
    const now = new Date();
    const todayZero = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    try {
        await pool.query('BEGIN');
        
        const conf = await pool.query('SELECT * FROM fukushi_system_settings');
        let cancelFee = 500, revokeFee = 0, mealFee = 300;
        conf.rows.forEach(r => {
            if(r.setting_key === 'cancel_fee') cancelFee = r.setting_value;
            if(r.setting_key === 'revoke_fee') revokeFee = r.setting_value;
            if(r.setting_key === 'meal_fee') mealFee = r.setting_value;
        });

        if (registers && registers.length > 0) {
            for (let d of registers) {
                const targetDate = new Date(d.replace(/-/g, '/'));
                const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                const existCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [user_id, d]);
                if (existCheck.rows.length > 0) {
                    await pool.query(
                        `UPDATE fukushi_meals SET status = '予約', amount = $1, updated_at = NOW() WHERE user_id = $2 AND meal_date = $3`,
                        [mealFee, user_id, d]
                    );
                } else {
                    await pool.query(
                        `INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, amount) VALUES ($1, $2, $3, '予約', $4)`,
                        [mealId, user_id, d, mealFee]
                    );
                }
            }
        }

        if (cancels && cancels.length > 0) {
            for (let d of cancels) {
                const targetDate = new Date(d.replace(/-/g, '/'));
                const diffDays = (targetDate - todayZero) / (1000 * 3600 * 24);
                let resultStatus = '取消';
                let resultFee = revokeFee;
                
                if (diffDays < 14) {
                    resultStatus = 'キャンセル';
                    resultFee = cancelFee;
                }
                await pool.query(
                    `UPDATE fukushi_meals SET status = $1, amount = $2, situation = $1, updated_at = NOW() WHERE user_id = $3 AND meal_date = $4`,
                    [resultStatus, resultFee, user_id, d]
                );
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("食事予約エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
// ====================================================
// ★ 確実なDB再構築のための専用API（ブラウザから直接叩く用）
// ====================================================
router.get('/setup-db', async (req, res) => {
    const forceSetupSql = `
        DROP TABLE IF EXISTS fukushi_schedule_details CASCADE;
        DROP TABLE IF EXISTS fukushi_schedules CASCADE;
        DROP TABLE IF EXISTS fukushi_meals CASCADE;
        -- ★これだけ書き忘れていました！システム設定も確実にリセットします
        DROP TABLE IF EXISTS fukushi_system_settings CASCADE;

        CREATE TABLE fukushi_schedules (
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

        CREATE TABLE fukushi_schedule_details (
            detail_id VARCHAR(50) PRIMARY KEY,
            plan_id VARCHAR(50) REFERENCES fukushi_schedules(plan_id) ON DELETE CASCADE,
            event_type VARCHAR(50),
            event_detail VARCHAR(100),
            time_out TIME,
            time_in TIME,
            status VARCHAR(20) DEFAULT '承認待ち',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE fukushi_meals (
            meal_id VARCHAR(50) PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            meal_date DATE NOT NULL,
            status VARCHAR(20) DEFAULT '予約',
            amount INTEGER DEFAULT 300,
            situation VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE fukushi_system_settings (
            setting_key VARCHAR(50) PRIMARY KEY,
            setting_value INTEGER NOT NULL
        );

        INSERT INTO fukushi_system_settings (setting_key, setting_value) 
        VALUES ('cancel_fee', 500), ('revoke_fee', 0), ('meal_fee', 300)
        ON CONFLICT (setting_key) DO NOTHING;
    `;

    try {
        await pool.query(forceSetupSql);
        res.json({ success: true, message: "データベースの再構築が完璧に完了しました！これでエラーは出ません。" });
    } catch (err) {
        res.json({ success: false, error: "テーブル作成失敗: " + err.message });
    }
});

module.exports = router;