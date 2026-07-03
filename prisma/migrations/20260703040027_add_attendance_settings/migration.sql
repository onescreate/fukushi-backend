-- CreateTable
CREATE TABLE "attendance_settings" (
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "early_leave_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_settings_facility_id_key" ON "attendance_settings"("facility_id");

-- AddForeignKey
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
