-- CreateEnum
CREATE TYPE "MealStatus" AS ENUM ('reserved', 'cancelled', 'revoked', 'eaten');

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "meals_enabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "meals" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "meal_date" DATE NOT NULL,
    "status" "MealStatus" NOT NULL DEFAULT 'reserved',
    "amount" INTEGER NOT NULL DEFAULT 0,
    "situation" TEXT,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meals_facility_id_meal_date_idx" ON "meals"("facility_id", "meal_date");

-- CreateIndex
CREATE UNIQUE INDEX "meals_user_id_meal_date_key" ON "meals"("user_id", "meal_date");

-- AddForeignKey
ALTER TABLE "meals" ADD CONSTRAINT "meals_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
