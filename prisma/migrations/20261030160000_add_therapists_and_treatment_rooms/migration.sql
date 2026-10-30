-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "appointmentBufferMinutes" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "Therapist" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Therapist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TherapistMassageService" (
    "therapistId" TEXT NOT NULL,
    "massageServiceId" TEXT NOT NULL,

    CONSTRAINT "TherapistMassageService_pkey" PRIMARY KEY ("therapistId","massageServiceId")
);

-- CreateTable
CREATE TABLE "TherapistWorkingHour" (
    "id" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,
    "dayOfWeek" "DayOfWeek" NOT NULL,
    "startMinutes" INTEGER NOT NULL,
    "endMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TherapistWorkingHour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TreatmentRoom" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TreatmentRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomMassageService" (
    "roomId" TEXT NOT NULL,
    "massageServiceId" TEXT NOT NULL,

    CONSTRAINT "RoomMassageService_pkey" PRIMARY KEY ("roomId","massageServiceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "Therapist_businessId_name_key" ON "Therapist"("businessId", "name");

-- CreateIndex
CREATE INDEX "TherapistMassageService_massageServiceId_idx" ON "TherapistMassageService"("massageServiceId");

-- CreateIndex
CREATE INDEX "TherapistWorkingHour_therapistId_dayOfWeek_idx" ON "TherapistWorkingHour"("therapistId", "dayOfWeek");

-- CreateIndex
CREATE UNIQUE INDEX "TreatmentRoom_businessId_name_key" ON "TreatmentRoom"("businessId", "name");

-- CreateIndex
CREATE INDEX "RoomMassageService_massageServiceId_idx" ON "RoomMassageService"("massageServiceId");

-- AddForeignKey
ALTER TABLE "Therapist" ADD CONSTRAINT "Therapist_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistMassageService" ADD CONSTRAINT "TherapistMassageService_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistMassageService" ADD CONSTRAINT "TherapistMassageService_massageServiceId_fkey" FOREIGN KEY ("massageServiceId") REFERENCES "MassageService"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TherapistWorkingHour" ADD CONSTRAINT "TherapistWorkingHour_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TreatmentRoom" ADD CONSTRAINT "TreatmentRoom_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMassageService" ADD CONSTRAINT "RoomMassageService_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "TreatmentRoom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomMassageService" ADD CONSTRAINT "RoomMassageService_massageServiceId_fkey" FOREIGN KEY ("massageServiceId") REFERENCES "MassageService"("id") ON DELETE CASCADE ON UPDATE CASCADE;
