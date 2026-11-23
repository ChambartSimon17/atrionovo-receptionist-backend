-- Locations: a treatment room can have its own opening
-- hours (a practice at home and one in a salon).

-- AlterTable
ALTER TABLE "TreatmentRoom" ADD COLUMN     "hasOwnHours" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "RoomOpeningHour" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "opensAtMinutes" INTEGER NOT NULL,
    "closesAtMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomOpeningHour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoomOpeningHour_roomId_dayOfWeek_idx" ON "RoomOpeningHour"("roomId", "dayOfWeek");

-- AddForeignKey
ALTER TABLE "RoomOpeningHour" ADD CONSTRAINT "RoomOpeningHour_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TreatmentRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;
