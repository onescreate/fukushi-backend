-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "ScheduleEventType" AS ENUM ('break_out', 'practice', 'other');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent');

-- CreateTable
CREATE TABLE "schedules" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_date" DATE NOT NULL,
    "plan_in" TEXT,
    "plan_out" TEXT,
    "status" "ScheduleStatus" NOT NULL DEFAULT 'approved',
    "note" TEXT,
    "created_by" UUID,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_details" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "event_type" "ScheduleEventType" NOT NULL,
    "planned_out" TEXT,
    "planned_in" TEXT,
    "actual_out" TEXT,
    "actual_in" TEXT,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_details_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "clock_in" TIMESTAMP(3),
    "clock_out" TIMESTAMP(3),
    "status" "AttendanceStatus" NOT NULL DEFAULT 'present',
    "is_late" BOOLEAN NOT NULL DEFAULT false,
    "is_early_leave" BOOLEAN NOT NULL DEFAULT false,
    "absence_reason" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "schedules_facility_id_plan_date_idx" ON "schedules"("facility_id", "plan_date");

-- CreateIndex
CREATE UNIQUE INDEX "schedules_user_id_plan_date_key" ON "schedules"("user_id", "plan_date");

-- CreateIndex
CREATE INDEX "schedule_details_schedule_id_idx" ON "schedule_details"("schedule_id");

-- CreateIndex
CREATE INDEX "attendances_facility_id_work_date_idx" ON "attendances"("facility_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendances_user_id_work_date_key" ON "attendances"("user_id", "work_date");

-- AddForeignKey
ALTER TABLE "schedules" ADD CONSTRAINT "schedules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_details" ADD CONSTRAINT "schedule_details_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
