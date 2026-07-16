import { parseBillingSnapshot } from './billing-snapshot';

describe('parseBillingSnapshot', () => {
  it('正常なスナップショットを変換する', () => {
    const r = parseBillingSnapshot({
      userId: 'U1',
      userName: '山田 太郎',
      mealCount: 3,
      mealTotal: 900,
      cancelCount: 1,
      cancelTotal: 300,
      total: 1200,
      taxAmount: 66,
      subtotal: 834,
      taxRate: 8,
      facilityName: '第1事業所',
    });
    expect(r).not.toBeNull();
    expect(r!.mealTotal).toBe(900);
    expect(r!.taxRate).toBe(8);
    expect(r!.facilityName).toBe('第1事業所');
  });

  it('必須項目(userId/userName)が無ければ null', () => {
    expect(parseBillingSnapshot({ mealTotal: 100 })).toBeNull();
    expect(parseBillingSnapshot(null)).toBeNull();
    expect(parseBillingSnapshot('x')).toBeNull();
    expect(parseBillingSnapshot({ userId: 'U1' })).toBeNull();
  });

  it('数値欠損は0に補正・taxRate欠損はnull', () => {
    const r = parseBillingSnapshot({ userId: 'U1', userName: 'A' });
    expect(r).not.toBeNull();
    expect(r!.mealTotal).toBe(0);
    expect(r!.cancelTotal).toBe(0);
    expect(r!.taxRate).toBeNull();
    expect(r!.facilityName).toBeNull();
  });

  it('数値でない金額(文字列やNaN)は0に補正', () => {
    const r = parseBillingSnapshot({
      userId: 'U1',
      userName: 'A',
      mealTotal: '900',
      taxAmount: NaN,
    });
    expect(r!.mealTotal).toBe(0);
    expect(r!.taxAmount).toBe(0);
  });
});
