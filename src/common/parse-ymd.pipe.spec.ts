import { BadRequestException } from '@nestjs/common';
import { ParseYmdPipe } from './parse-ymd.pipe';

describe('ParseYmdPipe', () => {
  const pipe = new ParseYmdPipe();

  it('正しい日付はそのまま返す', () => {
    expect(pipe.transform('2026-07-16')).toBe('2026-07-16');
    expect(pipe.transform('2026-02-28')).toBe('2026-02-28');
  });

  it('形式不正は400', () => {
    for (const v of ['2026/07/16', '2026-7-16', '20260716', 'x', '', undefined, null, 123]) {
      expect(() => pipe.transform(v as unknown)).toThrow(BadRequestException);
    }
  });

  it('存在しない日付は400', () => {
    for (const v of ['2026-02-30', '2026-13-01', '2026-00-10', '2026-04-31']) {
      expect(() => pipe.transform(v)).toThrow(BadRequestException);
    }
  });
});
