-- CreateEnum
CREATE TYPE "BusinessType" AS ENUM ('RESTAURANT', 'MASSAGE');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "businessType" "BusinessType" NOT NULL DEFAULT 'RESTAURANT';

-- CreateTable
CREATE TABLE "MassageService" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "durationMinutes" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MassageService_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MassageService_businessId_name_key" ON "MassageService"("businessId", "name");

-- AddForeignKey
ALTER TABLE "MassageService" ADD CONSTRAINT "MassageService_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
