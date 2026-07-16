/**
 * 食事予約の締切ルール（利用者本人の操作に適用。管理側は override で常に可）。
 *
 * 店舗設定 mealChangeDeadlineDays（既定14）を境に:
 *  - 利用日まで N日超          → free（自由・即確定）
 *  - N日以内〜前日15時まで     → application（申請・要承認、キャンセルはキャンセル料対象）
 *  - 前日15時以降（当日含む）   → closed（変更不可）
 *
 * すべて日本時間(JST)基準で判定する。
 */
import { jstNow } from '../common/date';

export { jstNow }; // 後方互換（従来 meal-rules 経由で jstNow を参照している箇所向け）

export type MealWindow = 'free' | 'application' | 'closed';

export function classifyMealWindow(
  mealDateStr: string, // "YYYY-MM-DD"
  deadlineDays: number,
  now: Date = new Date(),
): MealWindow {
  const jst = jstNow(now);
  const [y, m, d] = mealDateStr.split('-').map(Number);

  const today = new Date(jst.getFullYear(), jst.getMonth(), jst.getDate());
  const mealDay = new Date(y, m - 1, d);
  const daysUntil = Math.round(
    (mealDay.getTime() - today.getTime()) / 86400000,
  );

  // 前日15:00（= 利用日の1日前の15時）
  const deadline = new Date(y, m - 1, d - 1, 15, 0, 0, 0);
  if (jst.getTime() > deadline.getTime()) return 'closed';
  if (daysUntil > deadlineDays) return 'free';
  return 'application';
}
