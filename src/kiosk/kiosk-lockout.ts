/**
 * kiosk PINロックアウトの純粋ロジック（DB I/Oから分離してテスト可能にする）。
 * - 直近 PIN_WINDOW_MS の窓で PIN_MAX_ATTEMPTS 回失敗するとロック。
 * - ロックは PIN_LOCK_MS。ロック発動時に窓はリセットし、ロック明け後は新規カウントから。
 */

export const PIN_MAX_ATTEMPTS = 5;
export const PIN_WINDOW_MS = 60_000; // 失敗回数を数える窓
export const PIN_LOCK_MS = 60_000; // ロック時間

/** kiosk_pin_attempts の状態（DBの1行に相当） */
export interface PinAttemptState {
  failCount: number;
  firstFailAt: Date | null;
  lockedUntil: Date | null;
}

/** いまロックアウト中か */
export function isPinLocked(rec: PinAttemptState | null, now: Date): boolean {
  return !!rec?.lockedUntil && rec.lockedUntil.getTime() > now.getTime();
}

/**
 * 失敗を1回記録した後の新しい状態を返す（純粋関数）。
 * - 窓の外（前回失敗が古い）なら新しい窓を開始してカウント1。
 * - 上限に達したらロック発動し、窓はリセット（ロック明け後は再び1から）。
 */
export function recordPinFailure(
  rec: PinAttemptState | null,
  now: Date,
): PinAttemptState {
  const windowStart = now.getTime() - PIN_WINDOW_MS;
  const withinWindow =
    !!rec?.firstFailAt && rec.firstFailAt.getTime() > windowStart;

  const failCount = (withinWindow ? rec!.failCount : 0) + 1;
  const firstFailAt = withinWindow ? rec!.firstFailAt : now;

  if (failCount >= PIN_MAX_ATTEMPTS) {
    return {
      failCount: 0,
      firstFailAt: null,
      lockedUntil: new Date(now.getTime() + PIN_LOCK_MS),
    };
  }
  return { failCount, firstFailAt, lockedUntil: null };
}
