import { isLateArrival, isEarlyDeparture } from './attendance-rules';

describe('isLateArrival', () => {
  it('予定より遅く(猶予超)通所したら遅刻', () => {
    // 予定09:00(540), 猶予5分 → 545分超で遅刻
    expect(isLateArrival('09:00', 546, 5)).toBe(true);
    expect(isLateArrival('09:00', 545, 5)).toBe(false); // ちょうど猶予内
    expect(isLateArrival('09:00', 500, 5)).toBe(false); // 早い
  });
  it('予定開始が無ければ遅刻ではない', () => {
    expect(isLateArrival(null, 999, 0)).toBe(false);
    expect(isLateArrival('bad', 999, 0)).toBe(false);
  });
});

describe('isEarlyDeparture', () => {
  it('予定より早く(猶予超)退所したら早退', () => {
    // 予定17:00(1020), 猶予5分 → 1015分未満で早退
    expect(isEarlyDeparture('17:00', 1014, 5)).toBe(true);
    expect(isEarlyDeparture('17:00', 1015, 5)).toBe(false); // ちょうど猶予内
    expect(isEarlyDeparture('17:00', 1100, 5)).toBe(false); // 遅い
  });
  it('予定終了が無ければ早退ではない', () => {
    expect(isEarlyDeparture(null, 0, 0)).toBe(false);
    expect(isEarlyDeparture('bad', 0, 0)).toBe(false);
  });
});
