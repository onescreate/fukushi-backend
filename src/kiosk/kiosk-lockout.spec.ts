import {
  isPinLocked,
  recordPinFailure,
  PIN_MAX_ATTEMPTS,
  PIN_WINDOW_MS,
  PIN_LOCK_MS,
  PinAttemptState,
} from './kiosk-lockout';

const now = new Date('2026-07-16T10:00:00.000Z');

describe('isPinLocked', () => {
  it('記録なしはロックされていない', () => {
    expect(isPinLocked(null, now)).toBe(false);
  });
  it('lockedUntil が未来ならロック中', () => {
    const rec: PinAttemptState = {
      failCount: 0,
      firstFailAt: null,
      lockedUntil: new Date(now.getTime() + 1000),
    };
    expect(isPinLocked(rec, now)).toBe(true);
  });
  it('lockedUntil が過去ならロック解除', () => {
    const rec: PinAttemptState = {
      failCount: 0,
      firstFailAt: null,
      lockedUntil: new Date(now.getTime() - 1),
    };
    expect(isPinLocked(rec, now)).toBe(false);
  });
});

describe('recordPinFailure', () => {
  it('初回失敗はカウント1・未ロック', () => {
    const s = recordPinFailure(null, now);
    expect(s.failCount).toBe(1);
    expect(s.firstFailAt).toEqual(now);
    expect(s.lockedUntil).toBeNull();
  });

  it('窓の内側での失敗は加算される', () => {
    let s: PinAttemptState | null = null;
    for (let i = 1; i < PIN_MAX_ATTEMPTS; i++) {
      s = recordPinFailure(s, new Date(now.getTime() + i * 1000));
      expect(s.failCount).toBe(i);
      expect(s.lockedUntil).toBeNull();
    }
  });

  it('上限到達でロック発動（窓はリセット）', () => {
    let s: PinAttemptState | null = null;
    for (let i = 0; i < PIN_MAX_ATTEMPTS; i++) {
      s = recordPinFailure(s, new Date(now.getTime() + i * 1000));
    }
    expect(s!.lockedUntil).not.toBeNull();
    expect(s!.lockedUntil!.getTime()).toBe(
      now.getTime() + (PIN_MAX_ATTEMPTS - 1) * 1000 + PIN_LOCK_MS,
    );
    expect(s!.failCount).toBe(0); // 窓リセット
    expect(s!.firstFailAt).toBeNull();
  });

  it('窓の外の失敗は新しい窓として1から数え直す', () => {
    const old: PinAttemptState = {
      failCount: 4,
      firstFailAt: new Date(now.getTime() - PIN_WINDOW_MS - 1),
      lockedUntil: null,
    };
    const s = recordPinFailure(old, now);
    expect(s.failCount).toBe(1);
    expect(s.firstFailAt).toEqual(now);
    expect(s.lockedUntil).toBeNull();
  });
});
