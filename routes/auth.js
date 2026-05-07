const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db');

// ====================================================
// 1. 認証・ユーザー関連 API
// ====================================================
router.post('/admin/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const result = await pool.query('SELECT * FROM fukushi_admins WHERE email = $1', [email]);
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'メールアドレスまたはパスワードが違います' });
        
        const admin = result.rows[0];
        const isValidPassword = await bcrypt.compare(password, admin.password);
        if (!isValidPassword) return res.status(401).json({ success: false, message: 'メールアドレスまたはパスワードが違います' });

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
        if (result.rows.length === 0) return res.status(401).json({ success: false, message: 'ユーザーが見つかりません' });
        
        const user = result.rows[0];
        const isValidPin = await bcrypt.compare(pin_code, user.pin_code);
        if (!isValidPin) return res.status(401).json({ success: false, message: 'PINコードが違います' });

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


// ====================================================
// 2. データベース完全再構築 API (古い打刻データも一掃)
// ====================================================
router.get('/setup-db', async (req, res) => {
    const forceSetupSql = `
        DROP TABLE IF EXISTS fukushi_attendance CASCADE;
        DROP TABLE IF EXISTS fukushi_schedule_details CASCADE;
        DROP TABLE IF EXISTS fukushi_schedules CASCADE;
        DROP TABLE IF EXISTS fukushi_meals CASCADE;
        DROP TABLE IF EXISTS fukushi_system_settings CASCADE;

        CREATE TABLE fukushi_attendance (
            id SERIAL PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            stamp_type VARCHAR(10) NOT NULL,
            stamp_time TIMESTAMP NOT NULL
        );

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
            created_by VARCHAR(50),
            updated_by VARCHAR(50),
            approved_by VARCHAR(50),
            approved_at TIMESTAMP,
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
            created_by VARCHAR(50),
            updated_by VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE fukushi_meals (
            meal_id VARCHAR(50) PRIMARY KEY,
            user_id VARCHAR(50) NOT NULL,
            meal_date DATE NOT NULL,
            status VARCHAR(20) DEFAULT '予約',
            amount INTEGER DEFAULT 300,
            situation VARCHAR(50),
            created_by VARCHAR(50),
            updated_by VARCHAR(50),
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
        res.json({ success: true, message: "データベースの完全再構築が完了しました！古い打刻データも含めて全て綺麗にリセットされました。" });
    } catch (err) {
        res.json({ success: false, error: "テーブル作成失敗: " + err.message });
    }
});

// ====================================================
// ★ インボイス・請求備考用テーブルの確実な作成API
// （※既存データには影響しません）
// ====================================================
router.get('/setup-invoice-db', async (req, res) => {
    try {
        await pool.query('BEGIN');

        // ① 請求者情報（インボイス）履歴テーブルの作成
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fukushi_invoice_settings (
                id SERIAL PRIMARY KEY,
                company_name VARCHAR(100),
                invoice_number VARCHAR(50),
                postal_code VARCHAR(20),
                address VARCHAR(200),
                phone_number VARCHAR(20),
                bank_info TEXT,
                effective_date DATE NOT NULL,
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        `);

        // ② 請求備考テーブルの作成
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fukushi_billing_notes (
                user_id VARCHAR(50) NOT NULL,
                target_year INTEGER NOT NULL,
                target_month INTEGER NOT NULL,
                note TEXT,
                PRIMARY KEY (user_id, target_year, target_month)
            );
        `);

        // ③ インボイス設定の初期データ投入（空の場合のみ）
        const resCount = await pool.query('SELECT count(*) FROM fukushi_invoice_settings');
        if (resCount.rows[0].count === '0') {
            await pool.query(`
                INSERT INTO fukushi_invoice_settings 
                (company_name, invoice_number, effective_date, created_by, created_at) 
                VALUES ('法人名・事業所名', 'T0000000000000', '2000-01-01', 'system', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')
            `);
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: "インボイス設定および請求備考のテーブル作成が正常に完了しました。" });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("テーブル作成エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 納品管理テーブルの確実な作成・更新API（カラム追加版）
// ====================================================
router.get('/setup-delivery-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fukushi_meal_deliveries (
                delivery_date DATE PRIMARY KEY,
                delivered_count INTEGER DEFAULT 0,
                note TEXT,
                created_by VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
            
            -- 既存テーブルがある場合に備え、カラムが存在しない場合のみ追加する処理
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fukushi_meal_deliveries' AND column_name='note') THEN
                    ALTER TABLE fukushi_meal_deliveries ADD COLUMN note TEXT;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fukushi_meal_deliveries' AND column_name='created_by') THEN
                    ALTER TABLE fukushi_meal_deliveries ADD COLUMN created_by VARCHAR(50);
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fukushi_meal_deliveries' AND column_name='created_at') THEN
                    ALTER TABLE fukushi_meal_deliveries ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fukushi_meal_deliveries' AND column_name='updated_at') THEN
                    ALTER TABLE fukushi_meal_deliveries ADD COLUMN updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
                END IF;
            END $$;
        `);
        res.json({ success: true, message: "食事納品管理用のテーブル構成（備考・登録者・日時等）を更新しました。" });
    } catch (err) {
        console.error("納品テーブル更新エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 健康管理（体重・BMI）テーブルの確実な作成・更新API
// ====================================================
router.get('/setup-health-db', async (req, res) => {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS fukushi_health_records (
                user_id VARCHAR(50) NOT NULL,
                target_month DATE NOT NULL,
                weight DECIMAL(5,2),
                height DECIMAL(5,2),
                bmi DECIMAL(4,2),
                note TEXT, -- ★特記事項を追加
                recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                PRIMARY KEY (user_id, target_month)
            );

            -- すでにテーブルが存在する場合はnoteカラムを追加する
            DO $$ 
            BEGIN 
                IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='fukushi_health_records' AND column_name='note') THEN
                    ALTER TABLE fukushi_health_records ADD COLUMN note TEXT;
                END IF;
            END $$;
        `);
        res.json({ success: true, message: "健康管理テーブルの作成・更新が完了しました。" });
    } catch (err) {
        console.error("テーブル作成エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// 2.4 インボイス設定（履歴管理対応）・請求備考テーブル
// ====================================================
pool.query(`
    CREATE TABLE IF NOT EXISTS fukushi_invoice_settings (
        id SERIAL PRIMARY KEY,
        company_name VARCHAR(100),
        invoice_number VARCHAR(50),
        postal_code VARCHAR(20),
        address VARCHAR(200),
        phone_number VARCHAR(20),
        bank_info TEXT,
        effective_date DATE NOT NULL,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS fukushi_billing_notes (
        user_id VARCHAR(50) NOT NULL,
        target_year INTEGER NOT NULL,
        target_month INTEGER NOT NULL,
        note TEXT,
        PRIMARY KEY (user_id, target_year, target_month)
    );
`).then(async () => {
    const res = await pool.query('SELECT count(*) FROM fukushi_invoice_settings');
    if (res.rows[0].count === '0') {
        await pool.query(`
            INSERT INTO fukushi_invoice_settings 
            (company_name, invoice_number, effective_date, created_by) 
            VALUES ('法人名・事業所名', 'T0000000000000', '2000-01-01', 'system')
        `);
    }
}).catch(err => console.error("インボイステーブル作成エラー:", err));

// インボイス設定履歴の取得
router.get('/admin/settings/invoice/history', async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM fukushi_invoice_settings ORDER BY effective_date DESC');
        res.json({ success: true, history: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 指定した日付時点で有効なインボイス設定を取得
router.get('/admin/settings/invoice/active', async (req, res) => {
    const { date } = req.query; // 対象月（例：2024-05-31）
    try {
        const result = await pool.query(
            'SELECT * FROM fukushi_invoice_settings WHERE effective_date <= $1 ORDER BY effective_date DESC LIMIT 1',
            [date]
        );
        res.json({ success: true, settings: result.rows[0] || {} });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 新しいインボイス設定を履歴として保存
router.post('/admin/settings/invoice', async (req, res) => {
    const { company_name, invoice_number, postal_code, address, phone_number, bank_info, effective_date, operator } = req.body;
    const opName = operator || '管理者';
    try {
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        await pool.query(`
            INSERT INTO fukushi_invoice_settings 
            (company_name, invoice_number, postal_code, address, phone_number, bank_info, effective_date, created_by, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `, [company_name, invoice_number, postal_code, address, phone_number, bank_info, effective_date, opName, nowRes.rows[0].now_ts]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/admin/billing/note', async (req, res) => {
    const { user_id, year, month, note } = req.body;
    try {
        await pool.query(`
            INSERT INTO fukushi_billing_notes (user_id, target_year, target_month, note) 
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (user_id, target_year, target_month) 
            DO UPDATE SET note = EXCLUDED.note
        `, [user_id, year, month, note]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// ====================================================
// 2.5 料金マスタの自動生成と設定API
// ====================================================
pool.query(`
    CREATE TABLE IF NOT EXISTS fukushi_price_history (
        id SERIAL PRIMARY KEY,
        meal_fee INTEGER NOT NULL,
        cancel_fee INTEGER NOT NULL,
        effective_date DATE NOT NULL,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).then(async () => {
    const res = await pool.query('SELECT count(*) FROM fukushi_price_history');
    if (res.rows[0].count === '0') {
        await pool.query("INSERT INTO fukushi_price_history (meal_fee, cancel_fee, effective_date, created_by) VALUES (450, 500, '2000-01-01', 'system')");
    }
}).catch(err => console.error("料金テーブル作成エラー:", err));

router.get('/admin/settings/price', async (req, res) => {
    try {
        const query = `SELECT * FROM fukushi_price_history ORDER BY effective_date DESC`;
        const result = await pool.query(query);
        res.json({ success: true, history: result.rows });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/admin/settings/price', async (req, res) => {
    const { meal_fee, cancel_fee, effective_date, operator } = req.body;
    const opName = operator || '管理者';
    try {
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        await pool.query(
            `INSERT INTO fukushi_price_history (meal_fee, cancel_fee, effective_date, created_by, created_at) VALUES ($1, $2, $3, $4, $5)`,
            [meal_fee, cancel_fee, effective_date, opName, nowRes.rows[0].now_ts]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// 3. 利用者からの入力 API (日本時間・監査ログ対応)
// ====================================================
router.post('/user/stamp', async (req, res) => {
    const { user_id, stamp_type } = req.body;
    try {
        await pool.query('BEGIN');
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts, TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as d_str, TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') as t_str");
        const { now_ts, d_str, t_str } = nowRes.rows[0];

        await pool.query("INSERT INTO fukushi_attendance (user_id, stamp_type, stamp_time) VALUES ($1, $2, $3)", [user_id, stamp_type, now_ts]);

        const existCheck = await pool.query('SELECT plan_id, act_in FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, d_str]);

        if (existCheck.rows.length > 0) {
            const plan = existCheck.rows[0];
            if (stamp_type === 'in' && !plan.act_in) {
                await pool.query("UPDATE fukushi_schedules SET act_in = $1, updated_by = $2, updated_at = $3 WHERE plan_id = $4", [t_str, '本人打刻', now_ts, plan.plan_id]);
            } else if (stamp_type === 'out') {
                await pool.query("UPDATE fukushi_schedules SET act_out = $1, updated_by = $2, updated_at = $3 WHERE plan_id = $4", [t_str, '本人打刻', now_ts, plan.plan_id]);
            }
        } else {
            const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            const col = stamp_type === 'in' ? 'act_in' : 'act_out';
            await pool.query(
                `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, ${col}, status, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, '承認済', '自動生成', '本人打刻', $5, $5)`,
                [planId, user_id, d_str, t_str, now_ts]
            );
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: '打刻を記録しました' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("打刻エラー:", err);
        res.status(500).json({ success: false, message: 'サーバーエラー' });
    }
});

router.post('/user/schedule/submit', async (req, res) => {
    const { user_id, dates, plan_in, plan_out, note, is_admin, operator } = req.body;
    const opName = operator || '利用者';
    try {
        await pool.query('BEGIN');
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts, EXTRACT(YEAR FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo') as cur_y, EXTRACT(MONTH FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo') as cur_m, EXTRACT(DAY FROM CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo') as cur_d");
        const { now_ts, cur_y, cur_m, cur_d } = nowRes.rows[0];

        for (let d of dates) {
            const [yStr, mStr] = d.split('-');
            const targetYear = parseInt(yStr, 10);
            const targetMonth = parseInt(mStr, 10) - 1; 
            const monthsDiff = (targetYear - cur_y) * 12 + (targetMonth - (cur_m - 1));
            
            const existCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, d]);
            const isUpdate = existCheck.rows.length > 0;

            let status = "承認待ち";
            if (is_admin) status = "承認済";
            else if (!isUpdate) {
                if (monthsDiff >= 2 || (monthsDiff === 1 && cur_d <= 15)) status = "承認済";
            }

            if (isUpdate) {
                let sql = `UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, note = $3, status = $4, updated_by = $5, updated_at = $6`;
                if (status === '承認済') sql += `, approved_by = $5, approved_at = $6`;
                sql += ` WHERE user_id = $7 AND plan_date = $8`;
                await pool.query(sql, [plan_in, plan_out, note, status, opName, now_ts, user_id, d]);
            } else {
                const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
                if (status === '承認済') {
                    await pool.query(
                        `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, status, note, created_by, updated_by, approved_by, approved_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8, $9, $9, $9)`,
                        [planId, user_id, d, plan_in, plan_out, status, note, opName, now_ts]
                    );
                } else {
                    await pool.query(
                        `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, status, note, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9, $9)`,
                        [planId, user_id, d, plan_in, plan_out, status, note, opName, now_ts]
                    );
                }
            }
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
});


// ====================================================
// 4. データ一覧取得 API
// ====================================================
router.get('/admin/daily-roster', async (req, res) => {
    const { date } = req.query;
    try {
        const query = `
            SELECT u.user_id, u.last_name, u.first_name, s.plan_id, s.plan_in, s.plan_out, s.act_in, s.act_out, s.status as schedule_status, s.note, m.status as meal_status, m.situation as meal_situation
            FROM fukushi_users u
            LEFT JOIN fukushi_schedules s ON u.user_id = s.user_id AND s.plan_date = $1
            LEFT JOIN fukushi_meals m ON u.user_id = m.user_id AND m.meal_date = $1
            ORDER BY u.user_id ASC`;
        const result = await pool.query(query, [date]);
        const stamps = await pool.query(`SELECT user_id, stamp_type, TO_CHAR(stamp_time AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') as t_str FROM fukushi_attendance WHERE TO_CHAR(stamp_time AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = $1 ORDER BY stamp_time ASC`, [date]);
        
        let actInMap = {}, actOutMap = {}, stampMap = {};
        stamps.rows.forEach(s => {
            stampMap[s.user_id] = s.stamp_type;
            if (s.stamp_type === 'in' && !actInMap[s.user_id]) actInMap[s.user_id] = s.t_str;
            if (s.stamp_type === 'out') actOutMap[s.user_id] = s.t_str;
        });

        const roster = result.rows.map(r => ({
            planId: r.plan_id, userId: r.user_id, name: `${r.last_name} ${r.first_name}`,
            planIn: r.plan_in ? r.plan_in.substring(0, 5) : '', planOut: r.plan_out ? r.plan_out.substring(0, 5) : '',
            actIn: r.act_in ? r.act_in.substring(0, 5) : (actInMap[r.user_id] || ''),
            actOut: r.act_out ? r.act_out.substring(0, 5) : (actOutMap[r.user_id] || ''),
            scheduleStatus: r.schedule_status || '未登録', note: r.note || '',
            meal: r.meal_situation || r.meal_status || 'なし', currentStamp: stampMap[r.user_id] || '未打刻'
        }));
        res.json({ success: true, roster });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/pending-approvals', async (req, res) => {
    try {
        const query = `SELECT s.plan_id as id, u.last_name || ' ' || u.first_name as user_name, TO_CHAR(s.plan_date, 'YYYY-MM-DD') as date, '予定変更' as type, '通所時間: ' || COALESCE(s.plan_in, '--:--') || '〜' || COALESCE(s.plan_out, '--:--') as detail
            FROM fukushi_schedules s JOIN fukushi_users u ON s.user_id = u.user_id WHERE s.status = '承認待ち' ORDER BY s.plan_date ASC`;
        const result = await pool.query(query);
        res.json({ success: true, list: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/schedule-list', async (req, res) => {
    const { date } = req.query;
    try {
        const [y, m] = date.split('-');
        const query = `SELECT TO_CHAR(s.plan_date, 'YYYY/MM/DD') as date, u.last_name || ' ' || u.first_name as name, s.plan_in as "planIn", s.plan_out as "planOut", COALESCE(m.status, 'なし') as meal, s.status, s.note
            FROM fukushi_schedules s JOIN fukushi_users u ON s.user_id = u.user_id LEFT JOIN fukushi_meals m ON s.user_id = m.user_id AND s.plan_date = m.meal_date
            WHERE s.plan_date >= $1 AND s.plan_date <= $2`;
        const result = await pool.query(query, [`${y}-${m}-01`, `${y}-${m}-31`]);
        res.json({ success: true, list: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/attendance-list', async (req, res) => {
    const { year, month } = req.query;
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const query = `SELECT s.plan_id, TO_CHAR(s.plan_date, 'YYYY-MM-DD') as f_date, s.plan_in, s.plan_out, s.act_in, s.act_out, s.status, s.note, u.last_name, u.first_name
            FROM fukushi_schedules s JOIN fukushi_users u ON s.user_id = u.user_id
            WHERE s.plan_date >= $1 AND s.plan_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE
            ORDER BY s.plan_date DESC, u.user_id ASC`;
        const result = await pool.query(query, [startDate]);
        const list = result.rows.map(r => ({
            id: r.plan_id, date: r.f_date, name: `${r.last_name} ${r.first_name}`,
            planIn: r.plan_in ? r.plan_in.substring(0, 5) : '', planOut: r.plan_out ? r.plan_out.substring(0, 5) : '',
            actIn: r.act_in ? r.act_in.substring(0, 5) : '', actOut: r.act_out ? r.act_out.substring(0, 5) : '',
            status: ((!r.act_in || !r.act_out) && r.status !== '承認待ち') ? '打刻漏れ' : (r.note?.includes('【欠席】') ? '欠席' : '正常'),
            note: r.note || ''
        }));
        res.json({ success: true, list });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/admin/attendance/missing-count', async (req, res) => {
    try {
        const query = `SELECT COUNT(*) FROM fukushi_schedules WHERE (act_in IS NULL OR act_out IS NULL) AND status = '承認済' AND (note IS NULL OR note NOT LIKE '%【欠席】%') AND plan_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE`;
        const result = await pool.query(query);
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.get('/user/schedule/monthly', async (req, res) => {
    const { user_id, year, month } = req.query;
    try {
        const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
        const endDate = `${year}-${String(month).padStart(2, '0')}-31`;
        const result = await pool.query(`SELECT TO_CHAR(s.plan_date, 'YYYY/MM/DD') as date, s.plan_in as "planIn", s.plan_out as "planOut", s.status, s.note, m.status as meal FROM fukushi_schedules s LEFT JOIN fukushi_meals m ON s.user_id = m.user_id AND s.plan_date = m.meal_date WHERE s.user_id = $1 AND s.plan_date >= $2 AND s.plan_date <= $3`, [user_id, startDate, endDate]);
        let schedule = {};
        result.rows.forEach(r => { schedule[r.date] = r; });
        res.json({ success: true, schedule });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});


// ====================================================
// 5. 管理者によるデータ更新 API (監査ログ対応)
// ====================================================
router.post('/admin/schedule/update-status', async (req, res) => {
    const { plan_id, status, operator } = req.body;
    try {
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        let sql = `UPDATE fukushi_schedules SET status = $1, updated_by = $2, updated_at = $3`;
        if (status === '承認済') sql += `, approved_by = $2, approved_at = $3`;
        sql += ` WHERE plan_id = $4`;
        await pool.query(sql, [status, operator || '管理者', nowRes.rows[0].now_ts, plan_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/admin/attendance/update-time', async (req, res) => {
    const { plan_id, plan_in, plan_out, act_in, act_out, note, operator } = req.body;
    try {
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        await pool.query(`UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, act_in = $3, act_out = $4, note = $5, updated_by = $6, updated_at = $7 WHERE plan_id = $8`,
            [plan_in || null, plan_out || null, act_in || null, act_out || null, note, operator || '管理者', nowRes.rows[0].now_ts, plan_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

router.post('/admin/attendance/absent', async (req, res) => {
    const { userId, date, reason, operator } = req.body;
    const opName = operator || '管理者';
    try {
        await pool.query('BEGIN');
        const existCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [userId, date]);
        const noteText = `【欠席】${reason || ''}`;
        if (existCheck.rows.length > 0) {
            await pool.query(`UPDATE fukushi_schedules SET note = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE user_id = $3 AND plan_date = $4`, [noteText, opName, userId, date]);
        } else {
            const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, status, note, created_by, updated_by, approved_by, approved_at, created_at, updated_at) VALUES ($1, $2, $3, '承認済', $4, $5, $5, $5, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [planId, userId, date, noteText, opName]);
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/admin/meal/update-status', async (req, res) => {
    const { userId, date, status, subUserId, operator } = req.body;
    const opName = operator || '管理者';
    try {
        await pool.query('BEGIN');
        const existCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
        let targetStatus = status === '代食' ? 'キャンセル' : status;

        if (existCheck.rows.length > 0) {
            await pool.query(`UPDATE fukushi_meals SET status = $1, situation = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE user_id = $3 AND meal_date = $4`, [targetStatus, opName, userId, date]);
        } else if (targetStatus !== 'キャンセル' && targetStatus !== '取消') { 
            const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $4, $5, $5, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [mealId, userId, date, targetStatus, opName]);
        }

        if (status === '代食' && subUserId) {
            const subExistCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [subUserId, date]);
            if (subExistCheck.rows.length > 0) {
                await pool.query(`UPDATE fukushi_meals SET status = '予約', situation = '予約(代食)', updated_by = $1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE user_id = $2 AND meal_date = $3`, [opName, subUserId, date]);
            } else {
                const subMealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, '予約', '予約(代食)', $4, $4, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [subMealId, subUserId, date, opName]);
            }
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/admin/attendance/update-detail', async (req, res) => {
    const { userId, date, attendanceType, planIn, planOut, actIn, actOut, meal, note, breakIn, breakOut, breakReason, breakDetailSelect, breakDetailText, trainingPlace, operator } = req.body;
    const opName = operator || '管理者';
    try {
        await pool.query('BEGIN');
        const scheduleCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [userId, date]);
        let targetPlanId = '';
        let finalNote = note;
        if (attendanceType === '欠席') finalNote = `【欠席】${note}`;
        else if (attendanceType === '実習' && trainingPlace) finalNote = `【実習先: ${trainingPlace}】\n${note}`;

        if (scheduleCheck.rows.length > 0) {
            targetPlanId = scheduleCheck.rows[0].plan_id;
            await pool.query(`UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, act_in = $3, act_out = $4, note = $5, updated_by = $6, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE plan_id = $7`, [planIn || null, planOut || null, actIn || null, actOut || null, finalNote, opName, targetPlanId]);
        } else {
            targetPlanId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, act_in, act_out, status, note, created_by, updated_by, approved_by, approved_at, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, '承認済', $8, $9, $9, $9, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [targetPlanId, userId, date, planIn || null, planOut || null, actIn || null, actOut || null, finalNote, opName]);
        }

        await pool.query('DELETE FROM fukushi_schedule_details WHERE plan_id = $1', [targetPlanId]);
        if (breakIn && breakOut) {
            const detailId = 'D' + Date.now() + Math.floor(Math.random() * 10000);
            let eventDetail = breakReason;
            if (breakDetailSelect) eventDetail += ` (${breakDetailSelect})`;
            if (breakDetailText) eventDetail += `: ${breakDetailText}`;
            await pool.query(`INSERT INTO fukushi_schedule_details (detail_id, plan_id, event_type, event_detail, time_out, time_in, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, '中抜け', $3, $4, $5, $6, $6, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [detailId, targetPlanId, eventDetail, breakIn, breakOut, opName]);
        }

        const mealCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
        if (meal === 'なし') {
            if (mealCheck.rows.length > 0) await pool.query('DELETE FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
        } else {
            if (mealCheck.rows.length > 0) {
                await pool.query(`UPDATE fukushi_meals SET status = $1, situation = $1, updated_by = $2, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE user_id = $3 AND meal_date = $4`, [meal, opName, userId, date]);
            } else {
                const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $4, $5, $5, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`, [mealId, userId, date, meal, opName]);
            }
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 復旧：食事の一括予約・取消API（監査ログ対応版）
// ====================================================
router.post('/user/meal/submit', async (req, res) => {
    const { user_id, registers, cancels, operator } = req.body;
    const opName = operator || '管理者';
    try {
        await pool.query('BEGIN');
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        const now_ts = nowRes.rows[0].now_ts;

        // ① 予約の処理（追加または更新）
        if (registers && registers.length > 0) {
            for (let d of registers) {
                const existCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [user_id, d]);
                if (existCheck.rows.length > 0) {
                    await pool.query(`UPDATE fukushi_meals SET status = '予約', situation = '予約', updated_by = $1, updated_at = $2 WHERE user_id = $3 AND meal_date = $4`, [opName, now_ts, user_id, d]);
                } else {
                    const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                    await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, '予約', '予約', $4, $4, $5, $5)`, [mealId, user_id, d, opName, now_ts]);
                }
            }
        }

        // ② 取消の処理（データの削除）
        if (cancels && cancels.length > 0) {
            for (let d of cancels) {
                await pool.query('DELETE FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [user_id, d]);
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("食事一括登録エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 復旧＆拡張：食事注文リスト用 API群（監査ログ対応）
// ====================================================

// 1. 食事注文リスト一覧の取得
router.get('/admin/meal-list', async (req, res) => {
    const { year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        const query = `
            SELECT m.meal_id, TO_CHAR(m.meal_date, 'YYYY-MM-DD') as f_date,
                   m.status, m.amount as price, m.situation,
                   u.user_id, u.last_name, u.first_name
            FROM fukushi_meals m
            JOIN fukushi_users u ON m.user_id = u.user_id
            WHERE m.meal_date >= $1 AND m.meal_date <= $2
            ORDER BY m.meal_date DESC, u.user_id ASC
        `;
        const result = await pool.query(query, [startDate, endDate]);
        const list = result.rows.map(r => ({
            id: r.meal_id, date: r.f_date, userId: r.user_id,
            name: `${r.last_name} ${r.first_name}`,
            status: r.status, price: r.price || 300, situation: r.situation || ''
        }));
        res.json({ success: true, list });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. 食事注文の追加・編集 (自動料金計算＆2週間ルール対応)
router.post('/admin/meal/save', async (req, res) => {
    const { meal_id, user_id, date, status, situation, is_admin, operator } = req.body;
    const opName = operator || 'システム';
    try {
        await pool.query('BEGIN');
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE as today");
        const { now_ts, today } = nowRes.rows[0];

        // ① 対象日の料金マスタを取得（適用開始日が対象日以前で最新のもの）
        const priceRes = await pool.query(`SELECT meal_fee, cancel_fee FROM fukushi_price_history WHERE effective_date <= $1 ORDER BY effective_date DESC LIMIT 1`, [date]);
        const masterMealFee = priceRes.rows.length > 0 ? priceRes.rows[0].meal_fee : 450;
        const masterCancelFee = priceRes.rows.length > 0 ? priceRes.rows[0].cancel_fee : 500;

        // ② ユーザーの個別料金 (special_meal_fee) を取得
        let specialFee = 0;
        try {
            const userRes = await pool.query(`SELECT special_meal_fee FROM fukushi_users WHERE user_id = $1`, [user_id]);
            if (userRes.rows.length > 0 && userRes.rows[0].special_meal_fee > 0) {
                specialFee = userRes.rows[0].special_meal_fee;
            }
        } catch (e) { /* カラムがない場合は無視 */ }

        // ③ 確定金額と確定ステータスの計算
        let finalStatus = status;
        let finalAmount = 0;

        const targetDate = new Date(date);
        const todayDate = new Date(today);
        const diffDays = Math.floor((targetDate - todayDate) / (1000 * 60 * 60 * 24));

        if (status === '取消' || status === 'キャンセル' || situation === 'キャンセル' || situation === '代替') {
            if (is_admin && status === '取消') {
                finalStatus = '取消';
                finalAmount = 0;
            } 
            else if (diffDays >= 14) {
                finalStatus = '取消';
                finalAmount = 0;
            } 
            else {
                finalStatus = 'キャンセル';
                finalAmount = masterCancelFee;
            }
        } else {
            finalAmount = specialFee > 0 ? specialFee : masterMealFee;
        }

        // ④ DBへ保存
        if (meal_id) {
            await pool.query(
                `UPDATE fukushi_meals SET status = $1, amount = $2, situation = $3, updated_by = $4, updated_at = $5 WHERE meal_id = $6`,
                [finalStatus, finalAmount, situation, opName, now_ts, meal_id]
            );
        } else {
            const exist = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [user_id, date]);
            if (exist.rows.length > 0) {
                await pool.query('ROLLBACK');
                return res.status(400).json({ success: false, message: '指定した日付の食事データは既に存在します。「変更」から編集してください。' });
            }
            
            const newId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(
                `INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, amount, situation, created_by, updated_by, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $8, $8)`,
                [newId, user_id, date, finalStatus, finalAmount, situation, opName, now_ts]
            );
        }
        await pool.query('COMMIT');
        res.json({ success: true });
    } catch (err) {
        await pool.query('ROLLBACK');
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. 食事注文の削除
router.post('/admin/meal/delete', async (req, res) => {
    const { meal_id } = req.body;
    try {
        await pool.query('DELETE FROM fukushi_meals WHERE meal_id = $1', [meal_id]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ★新規追加：15時を過ぎても「予約」のままの食事注文数を取得（サイドバー通知用）
router.get('/admin/meal/pending-count', async (req, res) => {
    try {
        // 日本時間の「今日」と「15時」を基準に、未処理の予約をカウント
        const query = `
            SELECT COUNT(*) 
            FROM fukushi_meals 
            WHERE status = '予約' 
              AND (
                meal_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE 
                OR 
                (meal_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE 
                 AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::TIME > '15:00:00')
              )
        `;
        const result = await pool.query(query);
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) {
        console.error("食事通知カウントエラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 修正版：食事料金請求リスト取得 API (予約放置データのキャンセル料計算対応)
// ====================================================
router.get('/admin/billing-list', async (req, res) => {
    const { year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // ロジック：予約のまま(過去、または今日15時以降)ならキャンセル料を適用。それ以外は確定済みのamountを使用。
        const query = `
            SELECT 
                u.user_id, 
                u.last_name, 
                u.first_name,
                COUNT(m.meal_id) as meal_count,
                SUM(
                    CASE 
                        WHEN m.status = '予約' AND (
                            m.meal_date < (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE 
                            OR 
                            (m.meal_date = (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE 
                             AND (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::TIME > '15:00:00')
                        ) THEN 
                            (SELECT cancel_fee FROM fukushi_price_history ph 
                             WHERE ph.effective_date <= m.meal_date 
                             ORDER BY ph.effective_date DESC LIMIT 1)
                        ELSE COALESCE(m.amount, 0) 
                    END
                ) as total_amount,
                (SELECT note FROM fukushi_billing_notes n 
                 WHERE n.user_id = u.user_id AND n.target_year = $3 AND n.target_month = $4 LIMIT 1) as note
            FROM fukushi_users u
            JOIN fukushi_meals m ON u.user_id = m.user_id
            WHERE m.meal_date >= $1 AND m.meal_date <= $2
              AND m.status IN ('予約', '喫食済', 'キャンセル') 
            GROUP BY u.user_id, u.last_name, u.first_name
            ORDER BY u.user_id ASC
        `;
        
        const result = await pool.query(query, [startDate, endDate, y, m]);
        const list = result.rows.map(r => ({
            userId: r.user_id,
            name: `${r.last_name} ${r.first_name}`,
            mealCount: parseInt(r.meal_count),
            totalAmount: parseInt(r.total_amount),
            note: r.note || '',
            status: '未請求' 
        }));

        res.json({ success: true, list });
    } catch (err) {
        console.error("請求リスト取得エラー:", err);
        res.status(500).json({ success: false, error: "請求データの集計に失敗しました。" });
    }
});

// ====================================================
// ★ 食事納品管理用テーブルの自動生成
// ====================================================
pool.query(`
    CREATE TABLE IF NOT EXISTS fukushi_meal_deliveries (
        delivery_date DATE PRIMARY KEY,
        delivered_count INTEGER DEFAULT 0,
        updated_by VARCHAR(50),
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
`).catch(err => console.error("納品テーブル作成エラー:", err));

// ====================================================
// ★ 修正版：食事納品管理（タイムゾーン・集計バグ修正版）
// ====================================================
router.get('/admin/meal-delivery/monthly', async (req, res) => {
    const { year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // 1. 発注数：DB側で文字列(YYYY-MM-DD)に変換してから集計（ズレを防止）
        // 予約・喫食済・キャンセル（厨房が準備すべき数）をカウント
        const orderQuery = `
            SELECT TO_CHAR(meal_date, 'YYYY-MM-DD') as d_date, COUNT(*) as count 
            FROM fukushi_meals 
            WHERE meal_date >= $1 AND meal_date <= $2 
              AND status IN ('予約', '喫食済', 'キャンセル') 
            GROUP BY meal_date
        `;
        const orderRes = await pool.query(orderQuery, [startDate, endDate]);

        // 2. 納品数：こちらも文字列で取得
        const deliveryQuery = `
            SELECT TO_CHAR(delivery_date, 'YYYY-MM-DD') as d_date, delivered_count 
            FROM fukushi_meal_deliveries 
            WHERE delivery_date >= $1 AND delivery_date <= $2
        `;
        const deliveryRes = await pool.query(deliveryQuery, [startDate, endDate]);

        // 3. マージ処理
        const summary = {};
        // まず発注数をセット
        orderRes.rows.forEach(r => {
            summary[r.d_date] = { orderCount: parseInt(r.count), deliveryCount: 0 };
        });
        // 次に納品数を上書き・追加
        deliveryRes.rows.forEach(r => {
            if (!summary[r.d_date]) {
                summary[r.d_date] = { orderCount: 0, deliveryCount: parseInt(r.delivered_count) };
            } else {
                summary[r.d_date].deliveryCount = parseInt(r.delivered_count);
            }
        });

        res.json({ success: true, summary });
    } catch (err) {
        console.error("納品管理取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

router.post('/admin/meal-delivery/save', async (req, res) => {
    const { date, deliveredCount, orderedCount, note, operator } = req.body;
    try {
        // 差異がある場合の備考必須チェック
        if (parseInt(deliveredCount) !== parseInt(orderedCount) && (!note || note.trim() === '')) {
            return res.status(400).json({ success: false, error: '発注数と納品数に差異があるため、備考を入力してください。' });
        }

        await pool.query(`
            INSERT INTO fukushi_meal_deliveries (delivery_date, delivered_count, note, created_by, updated_at)
            VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
            ON CONFLICT (delivery_date) 
            DO UPDATE SET 
                delivered_count = EXCLUDED.delivered_count, 
                note = EXCLUDED.note,
                created_by = EXCLUDED.created_by,
                updated_at = CURRENT_TIMESTAMP
        `, [date, deliveredCount, note, operator || '管理者']);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// 【利用者用】今月の健康記録が必要かチェックする
// ====================================================
router.get('/user/health-check', async (req, res) => {
    const { user_id } = req.query;
    try {
        // 日本時間の現在日時から「今月の1日」を算出
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now");
        const now = nowRes.rows[0].now;
        const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // 今月の記録がすでにあるかチェック
        // ※記録がなければ(0件なら) true を返し、入力されるまで何度でもフォームを出す
        const recordCheck = await pool.query(
            `SELECT 1 FROM fukushi_health_records WHERE user_id = $1 AND target_month = $2`,
            [user_id, firstDayOfMonth]
        );

        res.json({ success: true, needInput: recordCheck.rows.length === 0 });
    } catch (err) { 
        console.error("健康チェックエラー:", err);
        res.status(500).json({ success: false }); 
    }
});

// 【利用者用】健康記録を保存する
router.post('/user/health-record', async (req, res) => {
    // ★ note を受け取るように追加
    const { user_id, weight, height, note } = req.body; 
    try {
        const now = new Date();
        const firstDayOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const bmi = (weight / ((height / 100) * (height / 100))).toFixed(2);

        await pool.query(`
            INSERT INTO fukushi_health_records (user_id, target_month, weight, height, bmi, note)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (user_id, target_month) DO UPDATE SET weight = $3, height = $4, bmi = $5, note = $6, updated_at = CURRENT_TIMESTAMP
        `, [user_id, firstDayOfMonth, weight, height, bmi, note]);
        res.json({ success: true });
    } catch (err) { 
        console.error("健康記録保存エラー:", err);
        res.status(500).json({ success: false }); 
    }
});

// ====================================================
// 【管理者用】健康記録一覧を取得する（note対応版）
// ====================================================
router.get('/admin/health-records', async (req, res) => {
    const { year, month } = req.query;
    try {
        const targetMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        const query = `
            SELECT u.user_id, u.last_name, u.first_name, 
                   h.weight, h.height, h.bmi, h.note, h.updated_at
            FROM fukushi_users u
            LEFT JOIN fukushi_health_records h ON u.user_id = h.user_id AND h.target_month = $1
            ORDER BY u.user_id ASC
        `;
        const result = await pool.query(query, [targetMonth]);
        
        // フロントエンドに返す際、日付を整形
        const list = result.rows.map(r => ({
            userId: r.user_id,
            name: `${r.last_name} ${r.first_name}`,
            weight: r.weight || '-',
            height: r.height || '-',
            bmi: r.bmi || '-',
            note: r.note || '',
            date: r.updated_at ? new Date(r.updated_at).toLocaleDateString('ja-JP') : '-'
        }));
        
        res.json({ success: true, list });
    } catch (err) { 
        console.error("記録取得エラー:", err);
        res.status(500).json({ success: false }); 
    }
});

// 【管理者用】健康記録を修正保存する（note対応版）
router.post('/admin/health-record/update', async (req, res) => {
    const { user_id, year, month, weight, height, note } = req.body;
    try {
        const targetMonth = `${year}-${String(month).padStart(2, '0')}-01`;
        // サーバーサイドでもBMIを計算（安全策）
        const bmi = (weight && height) ? (weight / ((height / 100) * (height / 100))).toFixed(2) : null;
        
        await pool.query(`
            INSERT INTO fukushi_health_records (user_id, target_month, weight, height, bmi, note, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
            ON CONFLICT (user_id, target_month) 
            DO UPDATE SET weight = $3, height = $4, bmi = $5, note = $6, updated_at = CURRENT_TIMESTAMP
        `, [user_id, targetMonth, weight, height, bmi, note]);
        res.json({ success: true });
    } catch (err) { 
        console.error("記録更新エラー:", err);
        res.status(500).json({ success: false }); 
    }
});

// ====================================================
// ★ テスト用：サンプル利用者追加API
// ====================================================
router.get('/setup-sample-users', async (req, res) => {
    try {
        // テスト用のPINコード「1234」を暗号化（ハッシュ化）
        const hashedPin = await bcrypt.hash('1234', 10);
        
        // サンプルユーザーを3名追加（すでに同じIDがある場合は無視する安全設計）
        await pool.query(`
            INSERT INTO fukushi_users (user_id, last_name, first_name, pin_code, role)
            VALUES 
            ('U901', 'テスト', '太郎', $1, 'user'),
            ('U902', 'サンプル', '花子', $1, 'user'),
            ('U903', '確認', '次郎', $1, 'user')
            ON CONFLICT (user_id) DO NOTHING;
        `, [hashedPin]);
        
        res.json({ 
            success: true, 
            message: "サンプル利用者を3名追加しました。",
            users: [
                { id: 'U901', name: 'テスト 太郎', pin: '1234' },
                { id: 'U902', name: 'サンプル 花子', pin: '1234' },
                { id: 'U903', name: '確認 次郎', pin: '1234' }
            ]
        });
    } catch (err) {
        console.error("サンプルユーザー追加エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 復旧：【利用者用】本日の予定とお弁当の有無を取得するAPI
// ====================================================
router.get('/user/today', async (req, res) => {
    const { user_id, date } = req.query;
    try {
        const planRes = await pool.query('SELECT plan_in, plan_out FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, date]);
        const mealRes = await pool.query('SELECT status FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [user_id, date]);

        let today = { planIn: '-', planOut: '-', mealStatus: 'なし' };
        if (planRes.rows.length > 0) {
            today.planIn = planRes.rows[0].plan_in ? planRes.rows[0].plan_in.substring(0, 5) : '-';
            today.planOut = planRes.rows[0].plan_out ? planRes.rows[0].plan_out.substring(0, 5) : '-';
        }
        if (mealRes.rows.length > 0) {
            today.mealStatus = mealRes.rows[0].status;
        }
        res.json({ success: true, today });
    } catch (err) {
        console.error("今日の予定取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;