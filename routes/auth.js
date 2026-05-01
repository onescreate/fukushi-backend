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

module.exports = router;