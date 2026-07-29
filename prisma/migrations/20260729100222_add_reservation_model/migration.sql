-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'NO_SHOW');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "maxCapacity" INTEGER NOT NULL DEFAULT 50;

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "email" TEXT,
    "guestCount" INTEGER NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "status" "ReservationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Reservation_restaurantId_idx" ON "Reservation"("restaurantId");

-- CreateIndex
CREATE INDEX "Reservation_startTime_idx" ON "Reservation"("startTime");

-- CreateIndex
CREATE INDEX "Reservation_endTime_idx" ON "Reservation"("endTime");

-- CreateIndex
CREATE INDEX "Reservation_restaurantId_startTime_idx" ON "Reservation"("restaurantId", "startTime");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
