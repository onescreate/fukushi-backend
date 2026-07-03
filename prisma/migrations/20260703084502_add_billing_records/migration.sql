-- CreateTable
CREATE TABLE "billing_records" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "payment_date" DATE,
    "note" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "billing_records_facility_id_year_month_idx" ON "billing_records"("facility_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "billing_records_user_id_year_month_key" ON "billing_records"("user_id", "year", "month");

-- AddForeignKey
ALTER TABLE "billing_records" ADD CONSTRAINT "billing_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
