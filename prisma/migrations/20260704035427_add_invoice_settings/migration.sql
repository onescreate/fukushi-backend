-- CreateTable
CREATE TABLE "invoice_settings" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "issuer_name" TEXT NOT NULL,
    "registration_number" TEXT,
    "postal_code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "bank_info" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "invoice_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "invoice_settings_facility_id_effective_date_idx" ON "invoice_settings"("facility_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "invoice_settings_facility_id_effective_date_key" ON "invoice_settings"("facility_id", "effective_date");

-- AddForeignKey
ALTER TABLE "invoice_settings" ADD CONSTRAINT "invoice_settings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
