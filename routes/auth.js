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

// ====================================================
// 1. 打刻API (日本時間・監査ログ対応)
// ====================================================
router.post('/user/stamp', async (req, res) => {
    const { user_id, stamp_type } = req.body;
    try {
        await pool.query('BEGIN');
        
        // 日本時間の現在時刻を取得
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts, TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as d_str, TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') as t_str");
        const { now_ts, d_str, t_str } = nowRes.rows[0];

        // 1. 打刻生ログに保存
        await pool.query(
            "INSERT INTO fukushi_attendance (user_id, stamp_type, stamp_time) VALUES ($1, $2, $3)",
            [user_id, stamp_type, now_ts]
        );

        // 2. スケジュール実績枠の更新
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

// ====================================================
// 2. 予定一括申請 (日本時間・監査ログ対応)
// ====================================================
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
// 3. データ表示API群 (復旧・日本時間固定)
// ====================================================

// 日別名簿
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

// 承認待ち
router.get('/admin/pending-approvals', async (req, res) => {
    try {
        const query = `SELECT s.plan_id as id, u.last_name || ' ' || u.first_name as user_name, TO_CHAR(s.plan_date, 'YYYY-MM-DD') as date, '予定変更' as type, '通所時間: ' || COALESCE(s.plan_in, '--:--') || '〜' || COALESCE(s.plan_out, '--:--') as detail
            FROM fukushi_schedules s JOIN fukushi_users u ON s.user_id = u.user_id WHERE s.status = '承認待ち' ORDER BY s.plan_date ASC`;
        const result = await pool.query(query);
        res.json({ success: true, list: result.rows });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 予定表一覧
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

// 打刻データ一覧 (今日まで)
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

// ====================================================
// 4. 管理者操作API群 (監査ログ対応)
// ====================================================

// 承認・却下
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

// 打刻修正
router.post('/admin/attendance/update-time', async (req, res) => {
    const { plan_id, plan_in, plan_out, act_in, act_out, note, operator } = req.body;
    try {
        const nowRes = await pool.query("SELECT CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' as now_ts");
        await pool.query(`UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, act_in = $3, act_out = $4, note = $5, updated_by = $6, updated_at = $7 WHERE plan_id = $8`,
            [plan_in || null, plan_out || null, act_in || null, act_out || null, note, operator || '管理者', nowRes.rows[0].now_ts, plan_id]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 打刻漏れカウント (バッジ用)
router.get('/admin/attendance/missing-count', async (req, res) => {
    try {
        const query = `SELECT COUNT(*) FROM fukushi_schedules WHERE (act_in IS NULL OR act_out IS NULL) AND status = '承認済' AND (note IS NULL OR note NOT LIKE '%【欠席】%') AND plan_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE`;
        const result = await pool.query(query);
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

// 利用者マスタ検索用 (一括登録時)
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

module.exports = router;