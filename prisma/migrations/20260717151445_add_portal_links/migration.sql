-- ポータル(会計)の店舗/法人への紐付け列を追加
ALTER TABLE "corporations" ADD COLUMN "external_corp_id" TEXT;
ALTER TABLE "facilities" ADD COLUMN "external_shop_id" TEXT;

CREATE UNIQUE INDEX "corporations_external_corp_id_key" ON "corporations"("external_corp_id");
CREATE UNIQUE INDEX "facilities_external_shop_id_key" ON "facilities"("external_shop_id");
