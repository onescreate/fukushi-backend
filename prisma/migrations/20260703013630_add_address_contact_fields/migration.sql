-- AlterTable
ALTER TABLE "corporations" ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "established_on" DATE,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "prefecture" TEXT;

-- AlterTable
ALTER TABLE "facilities" ADD COLUMN     "address_line" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "established_on" DATE,
ADD COLUMN     "phone" TEXT,
ADD COLUMN     "postal_code" TEXT,
ADD COLUMN     "prefecture" TEXT;
