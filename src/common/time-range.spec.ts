import { BadRequestException } from '@nestjs/common';
import { assertPlanOrder, isReversedRange } from './time-range';

describe('isReversedRange', () => {
  it('正しい順序は false', () => {
    expect(isReversedRange('09:00', '16:00')).toBe(false);
    expect(isReversedRange('00:00', '23:59')).toBe(false);
  });

  it('逆転は true（実際に起きた 15:26〜15:00 のケース）', () => {
    expect(isReversedRange('15:26', '15:00')).toBe(true);
    expect(isReversedRange('16:00', '09:00')).toBe(true);
  });

  it('同時刻も true（幅ゼロは予定として意味を成さない）', () => {
    expect(isReversedRange('10:00', '10:00')).toBe(true);
  });

  it('片方が無い・形式不正なら判定しない（false）', () => {
    expect(isReversedRange(null, '15:00')).toBe(false);
    expect(isReversedRange('15:00', undefined)).toBe(false);
    expect(isReversedRange('', '')).toBe(false);
    expect(isReversedRange('あ', '15:00')).toBe(false);
  });
});

describe('assertPlanOrder', () => {
  it('逆転していれば 400 を投げる', () => {
    expect(() => assertPlanOrder('15:26', '15:00')).toThrow(
      BadRequestException,
    );
  });

  it('正しい順序・片方未入力なら通す', () => {
    expect(() => assertPlanOrder('09:00', '16:00')).not.toThrow();
    expect(() => assertPlanOrder('09:00', undefined)).not.toThrow();
  });
});
