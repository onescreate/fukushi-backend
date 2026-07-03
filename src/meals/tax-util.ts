import { TaxRounding } from '@prisma/client';

function applyRounding(v: number, mode: TaxRounding): number {
  if (mode === 'floor') return Math.floor(v);
  if (mode === 'ceil') return Math.ceil(v);
  return Math.round(v);
}

/**
 * 金額に含まれる/加算される消費税額を求める。
 * - 内税(priceIncludesTax=true): 税込金額から税額を逆算（amount×rate/(100+rate)）
 * - 外税: 税抜金額に対する加算税（amount×rate/100）
 */
export function computeTax(
  amount: number,
  rate: number,
  priceIncludesTax: boolean,
  rounding: TaxRounding,
): number {
  if (rate <= 0 || amount <= 0) return 0;
  if (priceIncludesTax) {
    return applyRounding((amount * rate) / (100 + rate), rounding);
  }
  return applyRounding((amount * rate) / 100, rounding);
}
