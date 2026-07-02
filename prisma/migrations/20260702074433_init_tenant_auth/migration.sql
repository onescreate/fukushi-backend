-- CreateEnum
CREATE TYPE "Role" AS ENUM ('system_admin', 'corporation_admin', 'facility_admin', 'staff');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('transition', 'continuous_a', 'continuous_b', 'other');

-- CreateEnum
CREATE TYPE "EntityStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('active', 'withdrawn');

-- CreateTable
CREATE TABLE "corporations" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "corporations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "service_type" "ServiceType",
    "email" TEXT,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "remarks" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "firebase_uid" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_facility_roles" (
    "id" UUID NOT NULL,
    "staff_id" UUID NOT NULL,
    "facility_id" UUID,
    "role" "Role" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_facility_roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "corporation_id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "login_id" TEXT NOT NULL,
    "firebase_uid" TEXT,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "kana" TEXT,
    "pin_code" TEXT NOT NULL,
    "cert_number" TEXT,
    "special_meal_fee" INTEGER NOT NULL DEFAULT 0,
    "height_cm" DECIMAL(5,2),
    "status" "UserStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kiosk_devices" (
    "id" UUID NOT NULL,
    "facility_id" UUID NOT NULL,
    "device_token" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "status" "EntityStatus" NOT NULL DEFAULT 'active',
    "last_used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kiosk_devices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "facilities_corporation_id_idx" ON "facilities"("corporation_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_firebase_uid_key" ON "staff"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "staff_email_key" ON "staff"("email");

-- CreateIndex
CREATE INDEX "staff_corporation_id_idx" ON "staff"("corporation_id");

-- CreateIndex
CREATE INDEX "staff_facility_roles_facility_id_idx" ON "staff_facility_roles"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "staff_facility_roles_staff_id_facility_id_role_key" ON "staff_facility_roles"("staff_id", "facility_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_firebase_uid_key" ON "users"("firebase_uid");

-- CreateIndex
CREATE INDEX "users_corporation_id_idx" ON "users"("corporation_id");

-- CreateIndex
CREATE INDEX "users_facility_id_idx" ON "users"("facility_id");

-- CreateIndex
CREATE UNIQUE INDEX "kiosk_devices_device_token_key" ON "kiosk_devices"("device_token");

-- CreateIndex
CREATE INDEX "kiosk_devices_facility_id_idx" ON "kiosk_devices"("facility_id");

-- AddForeignKey
ALTER TABLE "facilities" ADD CONSTRAINT "facilities_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "corporations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff" ADD CONSTRAINT "staff_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "corporations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_facility_roles" ADD CONSTRAINT "staff_facility_roles_staff_id_fkey" FOREIGN KEY ("staff_id") REFERENCES "staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_facility_roles" ADD CONSTRAINT "staff_facility_roles_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_corporation_id_fkey" FOREIGN KEY ("corporation_id") REFERENCES "corporations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_facility_id_fkey" FOREIGN KEY ("facility_id") REFERENCES "facilities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
