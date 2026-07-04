-- CreateTable
CREATE TABLE "health_records" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "weight_kg" DECIMAL(5,2),
    "height_cm" DECIMAL(5,2),
    "note" TEXT,
    "measured_on" DATE,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "closing_operations" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "target_date" DATE NOT NULL,
    "regional_cooperation" BOOLEAN NOT NULL DEFAULT false,
    "transition_prep" BOOLEAN NOT NULL DEFAULT false,
    "absence_handling" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "closing_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "health_records_facility_id_year_month_idx" ON "health_records"("facility_id", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "health_records_user_id_year_month_key" ON "health_records"("user_id", "year", "month");

-- CreateIndex
CREATE INDEX "closing_operations_facility_id_target_date_idx" ON "closing_operations"("facility_id", "target_date");

-- CreateIndex
CREATE UNIQUE INDEX "closing_operations_user_id_target_date_key" ON "closing_operations"("user_id", "target_date");

-- AddForeignKey
ALTER TABLE "health_records" ADD CONSTRAINT "health_records_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "closing_operations" ADD CONSTRAINT "closing_operations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
