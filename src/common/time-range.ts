/**
 * 時刻の前後関係チェック（"HH:MM" の開始→終了）。
 *
 * 通所予定・中抜け・打刻はいずれも「開始 < 終了」でなければ意味を成さないが、
 * これまでどこにも検証が無く、逆転した値（例 15:26〜15:00）がそのまま保存・表示されていた。
 * ここで1本化し、保存の入口で弾く。
 */
import { BadRequestException } from '@nestjs/common';
import { parseHHMM } from './date';

/**
 * 「終了が開始と同じか、それより前」なら true。
 * どちらかが未入力／形式不正のときは判定しない（false）＝形式チェックは各DTOの担当。
 */
export function isReversedRange(
  from?: string | null,
  to?: string | null,
): boolean {
  if (!from || !to) return false;
  const a = parseHHMM(from);
  const b = parseHHMM(to);
  if (a === null || b === null) return false;
  return b <= a;
}

/** 逆転していれば 400 で弾く。message は画面にそのまま出る文言。 */
export function assertTimeOrder(
  from: string | null | undefined,
  to: string | null | undefined,
  message: string,
): void {
  if (isReversedRange(from, to)) throw new BadRequestException(message);
}

/** 通所予定（開始→終了）用の定型チェック。 */
export function assertPlanOrder(
  planIn?: string | null,
  planOut?: string | null,
): void {
  assertTimeOrder(
    planIn,
    planOut,
    '終了時刻は開始時刻より後にしてください',
  );
}

/** 中抜け（外出→戻り）用の定型チェック。 */
export function assertBreakOrder(
  plannedOut?: string | null,
  plannedIn?: string | null,
): void {
  assertTimeOrder(
    plannedOut,
    plannedIn,
    '中抜けの戻り時刻は外出時刻より後にしてください',
  );
}

/** 打刻（通所→退所）用の定型チェック。 */
export function assertClockOrder(
  clockIn?: string | null,
  clockOut?: string | null,
): void {
  assertTimeOrder(
    clockIn,
    clockOut,
    '退所時刻は通所時刻より後にしてください',
  );
}
