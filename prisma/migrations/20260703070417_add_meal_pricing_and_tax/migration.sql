-- CreateEnum
CREATE TYPE "TaxCategory" AS ENUM ('standard', 'reduced');

-- CreateEnum
CREATE TYPE "TaxRounding" AS ENUM ('floor', 'round', 'ceil');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "use_special_meal_fee" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "meal_pricings" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "meal_fee" INTEGER NOT NULL DEFAULT 0,
    "cancel_fee" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meal_pricings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_settings" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "category" "TaxCategory" NOT NULL DEFAULT 'reduced',
    "rate" INTEGER NOT NULL DEFAULT 8,
    "price_includes_tax" BOOLEAN NOT NULL DEFAULT true,
    "rounding" "TaxRounding" NOT NULL DEFAULT 'floor',
    "created_by" UUID,
    "updated_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "meal_pricings_facility_id_effective_date_idx" ON "meal_pricings"("facility_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "meal_pricings_facility_id_effective_date_key" ON "meal_pricings"("facility_id", "effective_date");

-- CreateIndex
CREATE INDEX "tax_settings_corporation_id_effective_date_idx" ON "tax_settings"("corporation_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "tax_settings_corporation_id_category_effective_date_key" ON "tax_settings"("corporation_id", "category", "effective_date");

-- AddForeignKey
ALTER TABLE "meal_pricings" ADD CONSTRAINT "meal_pricings_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tax_settings" ADD CONSTRAINT "tax_settings_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "corporations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
