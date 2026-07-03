-- CreateEnum
CREATE TYPE "MealApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateEnum
CREATE TYPE "MealRequestType" AS ENUM ('reserve', 'cancel');

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "meal_change_deadline_days" INTEGER NOT NULL DEFAULT 14;

-- AlterTable
ALTER TABLE "meals" ADD COLUMN     "approval_status" "MealApprovalStatus" NOT NULL DEFAULT 'approved',
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "approved_by" UUID,
ADD COLUMN     "request_type" "MealRequestType";

-- CreateIndex
CREATE INDEX "meals_facility_id_approval_status_idx" ON "meals"("facility_id", "approval_status");
