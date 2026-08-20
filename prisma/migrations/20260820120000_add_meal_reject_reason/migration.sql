-- 食事申請の却下理由（承認画面で入力し、利用者にそのまま見せる）。承認するとクリアされる。
-- AlterTable
ALTER TABLE "meals" ADD COLUMN "reject_reason" TEXT;
