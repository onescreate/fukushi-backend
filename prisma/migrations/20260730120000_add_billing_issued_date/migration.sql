-- 請求書の発行日（null=未発行）。手動「発行済みにする」で今日の日付が入る。
-- AlterTable
ALTER TABLE "billing_records" ADD COLUMN "issued_date" DATE;
