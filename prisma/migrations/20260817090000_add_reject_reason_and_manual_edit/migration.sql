-- 予定の却下理由（承認画面で入力し、利用者にそのまま見せる）。承認するとクリアされる。
-- AlterTable
ALTER TABLE "schedules" ADD COLUMN "reject_reason" TEXT;

-- 打刻の手修正の記録（誰が・いつ補正したか）。null=打刻そのまま。
-- 職員IDから名前を引けないケース（ポータル由来アカウント）があるため、氏名を文字列で残す。
-- AlterTable
ALTER TABLE "attendances" ADD COLUMN "manual_edited_at" TIMESTAMP(3);
ALTER TABLE "attendances" ADD COLUMN "manual_edited_by_name" TEXT;
