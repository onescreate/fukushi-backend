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
        await pool.query('BEGIN');
        
        // 1. 生ログに日本時間で記録
        await pool.query(
            "INSERT INTO fukushi_attendance (user_id, stamp_type, stamp_time) VALUES ($1, $2, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')",
            [user_id, stamp_type]
        );

        // 2. スケジュール実績枠を日本時間で更新
        const timeRes = await pool.query("SELECT TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') as d_str, TO_CHAR(CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') as t_str");
        const dateStr = timeRes.rows[0].d_str;
        const timeStr = timeRes.rows[0].t_str;

        const existCheck = await pool.query('SELECT plan_id, act_in FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, dateStr]);

        if (existCheck.rows.length > 0) {
            const plan = existCheck.rows[0];
            if (stamp_type === 'in' && !plan.act_in) {
                await pool.query("UPDATE fukushi_schedules SET act_in = $1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE plan_id = $2", [timeStr, plan.plan_id]);
            } else if (stamp_type === 'out') {
                await pool.query("UPDATE fukushi_schedules SET act_out = $1, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE plan_id = $2", [timeStr, plan.plan_id]);
            }
        } else {
            const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            if (stamp_type === 'in') {
                await pool.query(
                    `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, act_in, status, created_at, updated_at) VALUES ($1, $2, $3, $4, '承認済', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`,
                    [planId, user_id, dateStr, timeStr]
                );
            } else if (stamp_type === 'out') {
                await pool.query(
                    `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, act_out, status, created_at, updated_at) VALUES ($1, $2, $3, $4, '承認済', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`,
                    [planId, user_id, dateStr, timeStr]
                );
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: '打刻を正常に記録しました' });
    } catch (err) {
        await pool.query('ROLLBACK');
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
    // ★修正: is_admin を受け取るように追加
    const { user_id, dates, plan_in, plan_out, note, is_admin } = req.body;
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    try {
        await pool.query('BEGIN');
        for (let d of dates) {
            const [yStr, mStr, dStr] = d.split('-');
            const targetYear = parseInt(yStr, 10);
            const targetMonth = parseInt(mStr, 10) - 1; 
            
            const monthsDiff = (targetYear - currentYear) * 12 + (targetMonth - currentMonth);
            
            const existCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [user_id, d]);
            const isUpdate = existCheck.rows.length > 0;

            // ★修正: 管理者からの登録なら無条件で「承認済」。利用者なら15日ルール適用。
            let status = "承認待ち";
            if (is_admin) {
                status = "承認済";
            } else if (!isUpdate) {
                if (monthsDiff >= 2) {
                    status = "承認済"; 
                } else if (monthsDiff === 1 && currentDate <= 15) {
                    status = "承認済"; 
                }
            }

            let reasonMsg = note || "";
            
            if (isUpdate) {
                await pool.query(
                    `UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, note = $3, status = $4, updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' WHERE user_id = $5 AND plan_date = $6`,
                    [plan_in, plan_out, reasonMsg, status, user_id, d]
                );
            } else {
                const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(
                    `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, status, note, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo', CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')`,
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
    // 強制的に日本時間を取得
    const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
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

// 4. 予定・打刻・食事の履歴一覧取得API
router.get('/user/history/monthly', async (req, res) => {
    const { user_id, year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // 予定データの取得
        const scheduleResult = await pool.query(
            `SELECT plan_id, TO_CHAR(plan_date, 'YYYY/MM/DD') as f_date, plan_in, plan_out, act_in, act_out, status, note 
             FROM fukushi_schedules 
             WHERE user_id = $1 AND plan_date >= $2 AND plan_date <= $3`,
            [user_id, startDate, endDate]
        );

        // 食事データの取得
        const mealResult = await pool.query(
            `SELECT TO_CHAR(meal_date, 'YYYY/MM/DD') as f_date, status, situation 
             FROM fukushi_meals 
             WHERE user_id = $1 AND meal_date >= $2 AND meal_date <= $3`,
            [user_id, startDate, endDate]
        );

        // 打刻実績の取得（※FacilityDashboard側との連動のため、fukushi_attendanceからも取得）
        // ※act_in / act_out に直接入っている場合はそちらを優先しますが、
        // 今回はシンプルにスケジュールテーブルに保存されている実績時間(act_in/act_out)をメインに使用します。
        
        // データの結合（マージ）
        let historyMap = {};

        // ① 予定データをベースにマップを作成
        scheduleResult.rows.forEach(row => {
            historyMap[row.f_date] = {
                date: row.f_date,
                planIn: row.plan_in ? row.plan_in.substring(0, 5) : '-',
                planOut: row.plan_out ? row.plan_out.substring(0, 5) : '-',
                actIn: row.act_in ? row.act_in.substring(0, 5) : '-',
                actOut: row.act_out ? row.act_out.substring(0, 5) : '-',
                status: row.status,
                note: row.note || '',
                mealStatus: 'なし'
            };
        });

        // ② 食事データをマージ
        mealResult.rows.forEach(row => {
            const dStr = row.f_date;
            if (!historyMap[dStr]) {
                historyMap[dStr] = {
                    date: dStr, planIn: '-', planOut: '-', actIn: '-', actOut: '-', status: '-', note: '', mealStatus: 'なし'
                };
            }
            // situationがあればそれを、なければstatusをセット（GASの仕様踏襲）
            historyMap[dStr].mealStatus = row.situation ? row.situation : row.status;
        });

        // 日付順（古い順）に並び替え
        const list = Object.values(historyMap).sort((a, b) => (a.date > b.date ? 1 : -1));

        res.json({ success: true, list: list });
    } catch (err) {
        console.error("履歴取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 5. 予定の詳細（欠席・実習・中抜け）登録API
router.post('/user/schedule/detail', async (req, res) => {
    const { user_id, date, plan_in, plan_out, note, sub_events } = req.body;
    // date: "YYYY-MM-DD"形式
    
    try {
        await pool.query('BEGIN');

        // ① まず、対象日の予定（fukushi_schedules）が存在するか確認し、更新する
        const existCheck = await pool.query(
            'SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', 
            [user_id, date]
        );

        let targetPlanId = '';

        if (existCheck.rows.length > 0) {
            targetPlanId = existCheck.rows[0].plan_id;
            await pool.query(
                `UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, note = $3, updated_at = NOW() WHERE plan_id = $4`,
                [plan_in, plan_out, note, targetPlanId]
            );
        } else {
            // 万が一予定がまだない日を直接詳細登録しようとした場合は新規作成
            targetPlanId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(
                `INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, status, note) VALUES ($1, $2, $3, $4, $5, '承認待ち', $6)`,
                [targetPlanId, user_id, date, plan_in, plan_out, note]
            );
        }

        // ② 古い詳細データ（中抜けなど）が既に登録されていれば一度削除する（上書きのため）
        await pool.query('DELETE FROM fukushi_schedule_details WHERE plan_id = $1', [targetPlanId]);

        // ③ 新しい詳細データ（中抜け）が送られてきている場合は追加する
        if (sub_events && sub_events.length > 0) {
            for (let ev of sub_events) {
                const detailId = 'D' + Date.now() + Math.floor(Math.random() * 10000);
                await pool.query(
                    `INSERT INTO fukushi_schedule_details (detail_id, plan_id, event_type, event_detail, time_out, time_in) VALUES ($1, $2, $3, $4, $5, $6)`,
                    [detailId, targetPlanId, ev.category, ev.detail, ev.start, ev.end]
                );
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: '詳細データを保存しました' });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("詳細登録エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 6. 施設タブレット用：今日の予定・食事取得API
router.get('/user/today', async (req, res) => {
    const { user_id, date } = req.query; // dateは "YYYY-MM-DD" で送られてくる
    try {
        const schedule = await pool.query(
            "SELECT plan_in, plan_out FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2",
            [user_id, date]
        );
        const meal = await pool.query(
            "SELECT status, situation FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2",
            [user_id, date]
        );

        let planIn = '-', planOut = '-';
        if (schedule.rows.length > 0) {
            planIn = schedule.rows[0].plan_in ? schedule.rows[0].plan_in.substring(0, 5) : '-';
            planOut = schedule.rows[0].plan_out ? schedule.rows[0].plan_out.substring(0, 5) : '-';
        }

        let mealStatus = 'なし';
        if (meal.rows.length > 0) {
            // situationがあればそれ（取消・キャンセル）、なければstatus（予約）
            mealStatus = meal.rows[0].situation || meal.rows[0].status;
        }

        res.json({ success: true, today: { planIn, planOut, mealStatus } });
    } catch (err) {
        console.error("今日の予定取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 管理者用機能API
// ====================================================

// 7. 指定日の全ユーザー予定・打刻・食事状況を取得するAPI（日別名簿）
router.get('/admin/daily-roster', async (req, res) => {
    const { date } = req.query;
    try {
        const query = `
            SELECT 
                u.user_id, u.last_name, u.first_name,
                s.plan_id, s.plan_in, s.plan_out, s.act_in, s.act_out, s.status as schedule_status, s.note,
                m.status as meal_status, m.situation as meal_situation
            FROM fukushi_users u
            LEFT JOIN fukushi_schedules s ON u.user_id = s.user_id AND s.plan_date = $1
            LEFT JOIN fukushi_meals m ON u.user_id = m.user_id AND m.meal_date = $1
            ORDER BY u.user_id ASC
        `;
        const result = await pool.query(query, [date]);

        // 生の打刻履歴から、最初のINと最後のOUTの時間も拾う (日本時間に対応)
        const stamps = await pool.query(
            `SELECT user_id, stamp_type, TO_CHAR(stamp_time AT TIME ZONE 'Asia/Tokyo', 'HH24:MI') as t_str 
             FROM fukushi_attendance 
             WHERE TO_CHAR(stamp_time AT TIME ZONE 'Asia/Tokyo', 'YYYY-MM-DD') = $1 
             ORDER BY stamp_time ASC`,
            [date]
        );

        let stampMap = {};
        let actInMap = {};
        let actOutMap = {};

        stamps.rows.forEach(stamp => {
            stampMap[stamp.user_id] = stamp.stamp_type; 
            if (stamp.stamp_type === 'in') {
                if (!actInMap[stamp.user_id]) actInMap[stamp.user_id] = stamp.t_str; // 最初のIN
            } else if (stamp.stamp_type === 'out') {
                actOutMap[stamp.user_id] = stamp.t_str; // 最後のOUT
            }
        });

        const roster = result.rows.map(row => {
            let meal = 'なし';
            if (row.meal_situation) meal = row.meal_situation;
            else if (row.meal_status) meal = row.meal_status;

            // スケジュールに実績時間が手動入力されていればそれを優先、なければ生ログから補完
            const actualIn = row.act_in ? row.act_in.substring(0, 5) : (actInMap[row.user_id] || '');
            const actualOut = row.act_out ? row.act_out.substring(0, 5) : (actOutMap[row.user_id] || '');

            return {
                planId: row.plan_id,
                userId: row.user_id,
                name: `${row.last_name} ${row.first_name}`,
                planIn: row.plan_in ? row.plan_in.substring(0, 5) : '',
                planOut: row.plan_out ? row.plan_out.substring(0, 5) : '',
                actIn: actualIn,
                actOut: actualOut,
                scheduleStatus: row.schedule_status || '未登録',
                note: row.note || '',
                meal: meal,
                currentStamp: stampMap[row.user_id] || '未打刻'
            };
        });

        res.json({ success: true, roster });
    } catch (err) {
        console.error("日別一覧取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 8. 管理者用：予定のステータス更新（承認・差戻し）API
router.post('/admin/schedule/update-status', async (req, res) => {
    const { plan_id, status } = req.body;
    
    if (!plan_id) {
        return res.status(400).json({ success: false, error: "予定IDが指定されていません" });
    }

    try {
        await pool.query(
            'UPDATE fukushi_schedules SET status = $1, updated_at = NOW() WHERE plan_id = $2',
            [status, plan_id]
        );
        res.json({ success: true, message: `ステータスを「${status}」に更新しました` });
    } catch (err) {
        console.error("ステータス更新エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 9. 管理者用：全ユーザーの予定申請一覧（日付順）取得API
router.get('/admin/schedule-list', async (req, res) => {
    const { date } = req.query; // フロントエンド（日本時間）から送られてきた日付
    console.log("【Debug】Schedule List Requested for date >=:", date);

    try {
        const query = `
            SELECT 
                s.plan_id, 
                TO_CHAR(s.plan_date, 'YYYY-MM-DD') as f_date, 
                s.plan_in, s.plan_out, s.status as schedule_status, s.note,
                u.user_id, u.last_name, u.first_name,
                m.status as meal_status, m.situation as meal_situation
            FROM fukushi_schedules s
            LEFT JOIN fukushi_users u ON s.user_id = u.user_id
            LEFT JOIN fukushi_meals m ON s.user_id = m.user_id AND s.plan_date = m.meal_date
            WHERE s.plan_date >= $1::DATE  -- ここでキャストを確実に行う
            ORDER BY s.plan_date ASC, u.user_id ASC
        `;
        const result = await pool.query(query, [date]);
        console.log("【Debug】Found records:", result.rows.length);

        const list = result.rows.map(row => ({
            planId: row.plan_id,
            date: row.f_date.replace(/-/g, '/'), // 画面表示用に変換
            name: `${row.last_name || ''} ${row.first_name || ''}`.trim(),
            planIn: row.plan_in ? row.plan_in.substring(0, 5) : '-',
            planOut: row.plan_out ? row.plan_out.substring(0, 5) : '-',
            status: row.schedule_status,
            note: row.note || '',
            meal: row.meal_situation || row.meal_status || 'なし'
        }));

        res.json({ success: true, list });
    } catch (err) {
        console.error("一覧取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});


// ====================================================
// ★ 確実なDB再構築のための専用API（ブラウザから直接叩く用）
// ====================================================
router.get('/setup-db', async (req, res) => {
    const forceSetupSql = `
        DROP TABLE IF EXISTS fukushi_schedule_details CASCADE;
        DROP TABLE IF EXISTS fukushi_schedules CASCADE;
        DROP TABLE IF EXISTS fukushi_meals CASCADE;
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
            created_by VARCHAR(50),      -- ★追加：作成者
            updated_by VARCHAR(50),      -- ★追加：更新者
            approved_by VARCHAR(50),     -- ★追加：承認者
            approved_at TIMESTAMP,       -- ★追加：承認日時
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
            created_by VARCHAR(50),      -- ★追加：作成者
            updated_by VARCHAR(50),      -- ★追加：更新者
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
            created_by VARCHAR(50),      -- ★追加：作成者
            updated_by VARCHAR(50),      -- ★追加：更新者
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
        res.json({ success: true, message: "データベースの再構築が完璧に完了しました！新しい監査カラムが追加されています。" });
    } catch (err) {
        res.json({ success: false, error: "テーブル作成失敗: " + err.message });
    }
});

// ====================================================
// ★ 新機能：管理者ダッシュボード（名簿）からの更新API
// ====================================================

// 1. 欠席処理 API
router.post('/admin/attendance/absent', async (req, res) => {
    const { userId, date, reason } = req.body;
    try {
        await pool.query('BEGIN');
        const existCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [userId, date]);
        const noteText = `【欠席】${reason || ''}`;

        if (existCheck.rows.length > 0) {
            await pool.query(`UPDATE fukushi_schedules SET note = $1, updated_at = NOW() WHERE user_id = $2 AND plan_date = $3`, [noteText, userId, date]);
        } else {
            const planId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, status, note) VALUES ($1, $2, $3, '承認済', $4)`, [planId, userId, date, noteText]);
        }
        await pool.query('COMMIT');
        res.json({ success: true, message: "欠席処理が完了しました" });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("欠席処理エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 2. 食事状況の変更（代食含む） API
router.post('/admin/meal/update-status', async (req, res) => {
    const { userId, date, status, subUserId } = req.body;
    try {
        await pool.query('BEGIN');
        const existCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
        let targetStatus = status === '代食' ? 'キャンセル' : status;

        if (existCheck.rows.length > 0) {
            await pool.query(`UPDATE fukushi_meals SET status = $1, situation = $1, updated_at = NOW() WHERE user_id = $2 AND meal_date = $3`, [targetStatus, userId, date]);
        } else if (targetStatus !== 'キャンセル' && targetStatus !== '取消') { 
            const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation) VALUES ($1, $2, $3, $4, $4)`, [mealId, userId, date, targetStatus]);
        }

        if (status === '代食' && subUserId) {
            const subExistCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [subUserId, date]);
            if (subExistCheck.rows.length > 0) {
                await pool.query(`UPDATE fukushi_meals SET status = '予約', situation = '予約(代食)', updated_at = NOW() WHERE user_id = $1 AND meal_date = $2`, [subUserId, date]);
            } else {
                const subMealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation) VALUES ($1, $2, $3, '予約', '予約(代食)')`, [subMealId, subUserId, date]);
            }
        }
        await pool.query('COMMIT');
        res.json({ success: true, message: "食事状況を更新しました" });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("食事更新エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// 3. 総合編集（実績時間・食事・中抜け・備考などの一括更新） API
router.post('/admin/attendance/update-detail', async (req, res) => {
    const { 
        userId, date, attendanceType, planIn, planOut, actIn, actOut, 
        meal, note, breakIn, breakOut, breakReason, breakDetailSelect, breakDetailText, trainingPlace 
    } = req.body;

    try {
        await pool.query('BEGIN');

        // ① 予定・実績・備考の更新
        const scheduleCheck = await pool.query('SELECT plan_id FROM fukushi_schedules WHERE user_id = $1 AND plan_date = $2', [userId, date]);
        let targetPlanId = '';
        let finalNote = note;
        if (attendanceType === '欠席') finalNote = `【欠席】${note}`;
        else if (attendanceType === '実習' && trainingPlace) finalNote = `【実習先: ${trainingPlace}】\n${note}`;

        if (scheduleCheck.rows.length > 0) {
            targetPlanId = scheduleCheck.rows[0].plan_id;
            await pool.query(`UPDATE fukushi_schedules SET plan_in = $1, plan_out = $2, act_in = $3, act_out = $4, note = $5, updated_at = NOW() WHERE plan_id = $6`, [planIn || null, planOut || null, actIn || null, actOut || null, finalNote, targetPlanId]);
        } else {
            targetPlanId = 'A' + Date.now() + Math.floor(Math.random() * 1000);
            await pool.query(`INSERT INTO fukushi_schedules (plan_id, user_id, plan_date, plan_in, plan_out, act_in, act_out, status, note) VALUES ($1, $2, $3, $4, $5, $6, $7, '承認済', $8)`, [targetPlanId, userId, date, planIn || null, planOut || null, actIn || null, actOut || null, finalNote]);
        }

        // ② 中抜けデータの更新
        await pool.query('DELETE FROM fukushi_schedule_details WHERE plan_id = $1', [targetPlanId]);
        if (breakIn && breakOut) {
            const detailId = 'D' + Date.now() + Math.floor(Math.random() * 10000);
            let eventDetail = breakReason;
            if (breakDetailSelect) eventDetail += ` (${breakDetailSelect})`;
            if (breakDetailText) eventDetail += `: ${breakDetailText}`;
            await pool.query(`INSERT INTO fukushi_schedule_details (detail_id, plan_id, event_type, event_detail, time_out, time_in) VALUES ($1, $2, '中抜け', $3, $4, $5)`, [detailId, targetPlanId, eventDetail, breakIn, breakOut]);
        }

        // ③ 食事の更新（★ 5択のロジックを完全反映）
        const mealCheck = await pool.query('SELECT meal_id FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
        
        if (meal === 'なし') {
            // 「なし」の場合はDBから記録を削除して「最初からなかったこと」にする
            if (mealCheck.rows.length > 0) {
                await pool.query('DELETE FROM fukushi_meals WHERE user_id = $1 AND meal_date = $2', [userId, date]);
            }
        } else {
            // それ以外（予約・喫食・キャンセル・取消）の場合は更新または新規作成
            if (mealCheck.rows.length > 0) {
                await pool.query(`UPDATE fukushi_meals SET status = $1, situation = $1, updated_at = NOW() WHERE user_id = $2 AND meal_date = $3`, [meal, userId, date]);
            } else {
                const mealId = 'M' + Date.now() + Math.floor(Math.random() * 1000);
                await pool.query(`INSERT INTO fukushi_meals (meal_id, user_id, meal_date, status, situation) VALUES ($1, $2, $3, $4, $4)`, [mealId, userId, date, meal]);
            }
        }

        await pool.query('COMMIT');
        res.json({ success: true, message: "詳細データを一括更新しました" });
    } catch (err) {
        await pool.query('ROLLBACK');
        console.error("総合編集エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ====================================================
// ★ 新機能：管理者向け 月間打刻・予定データ一覧取得API
// ====================================================
router.get('/admin/attendance-list', async (req, res) => {
    const { year, month } = req.query;
    try {
        const y = parseInt(year, 10);
        const m = parseInt(month, 10);
        const startDate = `${y}-${String(m).padStart(2, '0')}-01`;
        const lastDay = new Date(y, m, 0).getDate();
        const endDate = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

        // ★修正：LEAST関数を使い、指定月末か「今日」の早い方まで（＝未来のデータを出さない）に制限
        const query = `
            SELECT 
                s.plan_id, 
                TO_CHAR(s.plan_date, 'YYYY-MM-DD') as f_date, 
                s.plan_in, s.plan_out, s.act_in, s.act_out, s.status, s.note,
                u.user_id, u.last_name, u.first_name
            FROM fukushi_schedules s
            JOIN fukushi_users u ON s.user_id = u.user_id
            WHERE s.plan_date >= $1 
              AND s.plan_date <= LEAST($2::DATE, (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE)
            ORDER BY s.plan_date DESC, u.user_id ASC
        `;
        const result = await pool.query(query, [startDate, endDate]);

        const list = result.rows.map(row => {
            let currentStatus = '正常';
            if (row.note && row.note.includes('【欠席】')) {
                currentStatus = '欠席';
            } else if ((!row.act_in || !row.act_out) && row.status !== '承認待ち') {
                // ★修正：INまたはOUTどちらか一方が空なら「打刻漏れ」とする
                currentStatus = '打刻漏れ';
            } else if (row.plan_in && row.act_in && row.act_in > row.plan_in) {
                currentStatus = '遅刻';
            } else if (row.plan_out && row.act_out && row.act_out < row.plan_out) {
                currentStatus = '早退';
            }

            return {
                id: row.plan_id,
                date: row.f_date,
                name: `${row.last_name} ${row.first_name}`,
                planIn: row.plan_in ? row.plan_in.substring(0, 5) : '',
                planOut: row.plan_out ? row.plan_out.substring(0, 5) : '',
                actIn: row.act_in ? row.act_in.substring(0, 5) : '',
                actOut: row.act_out ? row.act_out.substring(0, 5) : '',
                status: currentStatus,
                note: row.note || ''
            };
        });

        res.json({ success: true, list });
    } catch (err) {
        console.error("打刻一覧取得エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

// ★新規追加：全期間の打刻漏れ総数を取得するAPI（サイドバー通知用）
router.get('/admin/attendance/missing-count', async (req, res) => {
    try {
        const query = `
            SELECT COUNT(*) 
            FROM fukushi_schedules 
            WHERE (act_in IS NULL OR act_out IS NULL)
              AND status = '承認済'
              AND (note IS NULL OR (note NOT LIKE '%【欠席】%' AND note NOT LIKE '%【実習%'))
              AND plan_date <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo')::DATE
        `;
        const result = await pool.query(query);
        res.json({ success: true, count: parseInt(result.rows[0].count) });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// ★新規追加：打刻データ一覧からの安全な簡易編集API（食事や中抜けには触れない）
router.post('/admin/attendance/update-time', async (req, res) => {
    const { plan_id, plan_in, plan_out, act_in, act_out, note } = req.body;
    try {
        await pool.query(
            `UPDATE fukushi_schedules 
             SET plan_in = $1, plan_out = $2, act_in = $3, act_out = $4, note = $5, 
                 updated_at = CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Tokyo' 
             WHERE plan_id = $6`,
            [plan_in || null, plan_out || null, act_in || null, act_out || null, note, plan_id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error("打刻簡易編集エラー:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;