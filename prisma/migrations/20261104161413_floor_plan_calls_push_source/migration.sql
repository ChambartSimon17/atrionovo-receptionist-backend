-- CreateEnum
CREATE TYPE "BookingSource" AS ENUM ('APP', 'AI', 'WEB', 'WALK_IN');

-- CreateEnum
CREATE TYPE "FloorElementType" AS ENUM ('WALL', 'DOOR', 'WINDOW', 'BAR', 'PLANT', 'KITCHEN', 'LABEL', 'ROOM', 'RECEPTION', 'WAITING', 'CHANGING', 'SAUNA', 'SHOWER', 'STAIRS', 'TOILET', 'CORRIDOR');

-- CreateEnum
CREATE TYPE "CallOutcome" AS ENUM ('BOOKED', 'CHANGED', 'INFORMATION', 'NEEDS_CALLBACK');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "source" "BookingSource" NOT NULL DEFAULT 'APP';

-- AlterTable
ALTER TABLE "Table" ADD COLUMN     "areaId" TEXT,
ADD COLUMN     "isOnlineBookable" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "FloorArea" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 1200,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 1000,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorArea_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorElement" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "areaId" TEXT NOT NULL,
    "type" "FloorElementType" NOT NULL,
    "label" TEXT,
    "x" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "y" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "treatmentRoomId" TEXT,
    "beds" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FloorElement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CallLog" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "callerNumber" TEXT,
    "callerName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "outcome" "CallOutcome" NOT NULL DEFAULT 'INFORMATION',
    "summary" TEXT,
    "transcript" TEXT,
    "recordingUrl" TEXT,
    "endedReason" TEXT,
    "handledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FloorArea_businessId_idx" ON "FloorArea"("businessId");

-- CreateIndex
CREATE INDEX "FloorElement_businessId_idx" ON "FloorElement"("businessId");

-- CreateIndex
CREATE INDEX "FloorElement_areaId_idx" ON "FloorElement"("areaId");

-- CreateIndex
CREATE UNIQUE INDEX "CallLog_externalId_key" ON "CallLog"("externalId");

-- CreateIndex
CREATE INDEX "CallLog_businessId_startedAt_idx" ON "CallLog"("businessId", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "PushToken_token_key" ON "PushToken"("token");

-- CreateIndex
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");

-- AddForeignKey
ALTER TABLE "Table" ADD CONSTRAINT "Table_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FloorArea"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorArea" ADD CONSTRAINT "FloorArea_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_areaId_fkey" FOREIGN KEY ("areaId") REFERENCES "FloorArea"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorElement" ADD CONSTRAINT "FloorElement_treatmentRoomId_fkey" FOREIGN KEY ("treatmentRoomId") REFERENCES "TreatmentRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CallLog" ADD CONSTRAINT "CallLog_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
