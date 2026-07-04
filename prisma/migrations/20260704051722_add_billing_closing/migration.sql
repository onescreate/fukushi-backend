-- AlterTable
ALTER TABLE "billing_records" ADD COLUMN     "closed_snapshot" JSONB;

-- CreateTable
CREATE TABLE "billing_closings" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "closed_by" UUID,
    "closed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "billing_closings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "billing_closings_facility_id_year_month_key" ON "billing_closings"("facility_id", "year", "month");

-- AddForeignKey
ALTER TABLE "billing_closings" ADD CONSTRAINT "billing_closings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
