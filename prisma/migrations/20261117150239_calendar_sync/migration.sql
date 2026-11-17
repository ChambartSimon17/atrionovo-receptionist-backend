-- CreateEnum
CREATE TYPE "CalendarProvider" AS ENUM ('ICLOUD_CALDAV', 'ICS_FEED');

-- CreateEnum
CREATE TYPE "ExternalSyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "externalEventEtag" TEXT,
ADD COLUMN     "externalEventUid" TEXT,
ADD COLUMN     "externalEventUrl" TEXT,
ADD COLUMN     "externalSyncError" TEXT,
ADD COLUMN     "externalSyncStatus" "ExternalSyncStatus";

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "provider" "CalendarProvider" NOT NULL,
    "username" TEXT,
    "encryptedSecret" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalCalendar" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "remoteUrl" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "isWriteTarget" BOOLEAN NOT NULL DEFAULT false,
    "therapistId" TEXT,
    "travelMinutes" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "ctag" TEXT,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalCalendar_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExternalBusyBlock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "uid" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3) NOT NULL,
    "allDay" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExternalBusyBlock_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_businessId_idx" ON "CalendarConnection"("businessId");

-- CreateIndex
CREATE INDEX "ExternalCalendar_businessId_idx" ON "ExternalCalendar"("businessId");

-- CreateIndex
CREATE UNIQUE INDEX "ExternalCalendar_connectionId_remoteUrl_key" ON "ExternalCalendar"("connectionId", "remoteUrl");

-- CreateIndex
CREATE INDEX "ExternalBusyBlock_businessId_startTime_idx" ON "ExternalBusyBlock"("businessId", "startTime");

-- CreateIndex
CREATE INDEX "ExternalBusyBlock_calendarId_startTime_idx" ON "ExternalBusyBlock"("calendarId", "startTime");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalCalendar" ADD CONSTRAINT "ExternalCalendar_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "Therapist"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalBusyBlock" ADD CONSTRAINT "ExternalBusyBlock_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalBusyBlock" ADD CONSTRAINT "ExternalBusyBlock_calendarId_fkey" FOREIGN KEY ("calendarId") REFERENCES "ExternalCalendar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
