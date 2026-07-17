-- サービス種別を自由記述(text)化し、管理マスタ service_types を追加
ALTER TABLE "facilities" ALTER COLUMN "service_type" TYPE TEXT USING "service_type"::text;

CREATE TABLE "service_types" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_types_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_types_name_key" ON "service_types"("name");

INSERT INTO "service_types" ("id","name","sort_order","updated_at") VALUES
  (gen_random_uuid(),'就労移行支援',1,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'就労継続支援A型',2,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'就労継続支援B型',3,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'通所介護',4,CURRENT_TIMESTAMP),
  (gen_random_uuid(),'その他',5,CURRENT_TIMESTAMP);

DROP TYPE IF EXISTS "ServiceType";
