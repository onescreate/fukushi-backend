/**
 * 予定の自動承認ルール（旧システム踏襲）。
 * - 2ヶ月以上先の予定 → 自動承認
 * - 翌月分の予定で、今日が当月15日まで → 自動承認
 * - それ以外（当月・翌月の16日以降申請・過去）→ 承認待ち
 *
 * 日本時間(JST)基準で判定する。
 */
import { jstNow } from '../common/date';

export function computeAutoApproveStatus(
  planDateStr: string, // "YYYY-MM-DD"
  now: Date = new Date(),
): 'approved' | 'pending' {
  const [py, pm] = planDateStr.split('-').map(Number); // 年, 月(1-12)

  // 現在日時をJSTの壁時計に変換
  const jst = jstNow(now);
  const ny = jst.getFullYear();
  const nm = jst.getMonth() + 1;
  const nd = jst.getDate();

  const monthsDiff = (py - ny) * 12 + (pm - nm);
  if (monthsDiff >= 2 || (monthsDiff === 1 && nd <= 15)) return 'approved';
  return 'pending';
}
