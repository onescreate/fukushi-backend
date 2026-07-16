-- CreateTable
CREATE TABLE "kiosk_pin_attempts" (
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "fail_count" INTEGER NOT NULL DEFAULT 0,
    "first_fail_at" TIMESTAMP(3),
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_pin_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_pin_attempts_facility_id_user_id_key" ON "kiosk_pin_attempts"("facility_id", "user_id");
