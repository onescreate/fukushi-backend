-- 事業所ごとの請求書設定（発行者はポータル法人から自動取得。ここは口座選択・社印有無・任意上書きのみ）。
-- CreateTable
CREATE TABLE "facility_invoice_configs" (
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "bank_account_id" TEXT,
    "seal_enabled" BOOLEAN NOT NULL DEFAULT true,
    "issuer_name_override" TEXT,
    "registration_number_override" TEXT,
    "postal_code_override" TEXT,
    "address_override" TEXT,
    "phone_override" TEXT,
    "bank_info_override" TEXT,
    "remark" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facility_invoice_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "facility_invoice_configs_facility_id_key" ON "facility_invoice_configs"("facility_id");

-- AddForeignKey
ALTER TABLE "facility_invoice_configs" ADD CONSTRAINT "facility_invoice_configs_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
