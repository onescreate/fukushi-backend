import {
  pad,
  dateStr,
  toHHMM,
  minutesOfDay,
  parseHHMM,
  jstDateStr,
  jstHHMM,
} from './date';

describe('date utils (基本)', () => {
  it('pad は2桁ゼロ埋め', () => {
    expect(pad(1)).toBe('01');
    expect(pad(12)).toBe('12');
  });

  it('dateStr / toHHMM / minutesOfDay', () => {
    const d = new Date(2026, 6, 5, 9, 3); // ローカル 2026-07-05 09:03
    expect(dateStr(d)).toBe('2026-07-05');
    expect(toHHMM(d)).toBe('09:03');
    expect(minutesOfDay(d)).toBe(9 * 60 + 3);
  });

  it('parseHHMM', () => {
    expect(parseHHMM('09:30')).toBe(570);
    expect(parseHHMM('9:5')).toBeNull();
    expect(parseHHMM('x')).toBeNull();
  });
});

describe('JST変換（マシンのTZに依存しない）', () => {
  it('00:30 UTC は JST 09:30・同日', () => {
    const instant = new Date('2026-07-16T00:30:00.000Z');
    expect(jstDateStr(instant)).toBe('2026-07-16');
    expect(jstHHMM(instant)).toBe('09:30');
  });

  it('前日16:00 UTC は JST 翌日01:00（日付が繰り上がる）', () => {
    const instant = new Date('2026-07-15T16:00:00.000Z');
    expect(jstDateStr(instant)).toBe('2026-07-16');
    expect(jstHHMM(instant)).toBe('01:00');
  });
});
