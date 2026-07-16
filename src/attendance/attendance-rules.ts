import { parseHHMM } from '../common/date';

/**
 * 打刻の遅刻・早退判定（純粋関数）。
 * ※判定は「承認済みの予定」に対してのみ意味を持つ（呼び出し側で status を確認する）。
 */

/**
 * 遅刻か: 実通所(その日の経過分, JST) が 予定開始 + 猶予 を超えていれば true。
 * 予定開始が無い/不正なら false。
 */
export function isLateArrival(
  planIn: string | null,
  actualMinutes: number,
  graceMinutes: number,
): boolean {
  if (!planIn) return false;
  const pin = parseHHMM(planIn);
  return pin !== null && actualMinutes > pin + graceMinutes;
}

/**
 * 早退か: 実退所(その日の経過分, JST) が 予定終了 - 猶予 未満なら true。
 * 予定終了が無い/不正なら false。
 */
export function isEarlyDeparture(
  planOut: string | null,
  actualMinutes: number,
  graceMinutes: number,
): boolean {
  if (!planOut) return false;
  const pout = parseHHMM(planOut);
  return pout !== null && actualMinutes < pout - graceMinutes;
}
