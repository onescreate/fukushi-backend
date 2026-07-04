-- CreateTable
CREATE TABLE "meal_deliveries" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "delivery_date" DATE NOT NULL,
    "delivery_count" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_deliveries_facility_id_delivery_date_idx" ON "meal_deliveries"("facility_id", "delivery_date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_deliveries_facility_id_delivery_date_key" ON "meal_deliveries"("facility_id", "delivery_date");

-- AddForeignKey
ALTER TABLE "meal_deliveries" ADD CONSTRAINT "meal_deliveries_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
