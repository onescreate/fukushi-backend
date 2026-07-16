/**
 * 日付・時刻の共通ユーティリティ（日本時間=JST基準）。
 *
 * これまで各サービスに重複コピーされていた pad / jstNow / dateStr / toHHMM などを1本化する。
 * ※挙動は従来と同一（純粋関数）。JSTの「壁時計」を扱うため、jstNow の返り値の
 *   ローカル getter(getHours 等)は JST の値になる。
 */

/** 数値を2桁ゼロ埋め */
export const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * 与えた瞬間(既定=現在)を「JSTの壁時計」を表すDateに変換する。
 * 返り値の getFullYear/getMonth/getDate/getHours/getMinutes は JST の値になる。
 */
export function jstNow(now: Date = new Date()): Date {
  return new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }));
}

/** Dateのローカル日付を "YYYY-MM-DD" に */
export function dateStr(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Dateのローカル時刻を "HH:MM" に */
export function toHHMM(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** ローカル時刻の「その日の経過分」 */
export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** "HH:MM" を分に変換。不正な形式なら null */
export function parseHHMM(s: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

/** ある瞬間の JST 暦日を "YYYY-MM-DD" で返す（= dateStr(jstNow(instant))） */
export function jstDateStr(instant: Date = new Date()): string {
  return dateStr(jstNow(instant));
}

/** ある瞬間の JST 時刻を "HH:MM" で返す（= toHHMM(jstNow(instant))） */
export function jstHHMM(instant: Date): string {
  return toHHMM(jstNow(instant));
}
