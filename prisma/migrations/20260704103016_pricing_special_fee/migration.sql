-- AlterTable
ALTER TABLE "meal_pricings" ADD COLUMN     "special_meal_fee" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" DROP COLUMN "special_meal_fee";

