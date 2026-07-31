-- CreateEnum
CREATE TYPE "DayOfWeek" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');

-- CreateTable
CREATE TABLE "OpeningHour" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "opensAtMinutes" INTEGER NOT NULL,
    "closesAtMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_opening_hour_restaurant_day" ON "OpeningHour"("restaurantId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "OpeningHour" ADD CONSTRAINT "OpeningHour_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "Reservation_endTime_idx" RENAME TO "idx_reservation_end_time";

-- RenameIndex
ALTER INDEX "Reservation_restaurantId_idx" RENAME TO "idx_reservation_restaurant";

-- RenameIndex
ALTER INDEX "Reservation_restaurantId_startTime_idx" RENAME TO "idx_reservation_restaurant_start";

-- RenameIndex
ALTER INDEX "Reservation_startTime_idx" RENAME TO "idx_reservation_start_time";
