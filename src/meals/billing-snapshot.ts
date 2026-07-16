/**
 * 月締めスナップショット(closedSnapshot: JSON) を安全に読み取るための型と検証。
 * DBのJSONは unknown なので、`as unknown as` の無検証キャストを避け、
 * 形が壊れていても NaN 等で下流を汚さないようにする。
 */
export interface BillingAmountRow {
  userId: string;
  userName: string;
  mealCount: number;
  mealTotal: number;
  cancelCount: number;
  cancelTotal: number;
  total: number;
  taxAmount: number;
  subtotal: number;
  taxRate: number | null;
  facilityName?: string | null;
}

const num = (v: unknown): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : 0;

/**
 * closedSnapshot(unknown) を BillingAmountRow に変換する。
 * - 必須項目(userId/userName)が無ければ null（＝壊れたスナップショットは無視）。
 * - 数値項目は欠損/不正なら 0 に補正。taxRate は数値でなければ null。
 */
export function parseBillingSnapshot(x: unknown): BillingAmountRow | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (typeof o.userId !== 'string' || typeof o.userName !== 'string') {
    return null;
  }
  return {
    userId: o.userId,
    userName: o.userName,
    mealCount: num(o.mealCount),
    mealTotal: num(o.mealTotal),
    cancelCount: num(o.cancelCount),
    cancelTotal: num(o.cancelTotal),
    total: num(o.total),
    taxAmount: num(o.taxAmount),
    subtotal: num(o.subtotal),
    taxRate: typeof o.taxRate === 'number' ? o.taxRate : null,
    facilityName: typeof o.facilityName === 'string' ? o.facilityName : null,
  };
}
