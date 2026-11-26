-- Overlap of an appointment with busy time from the
-- business's own calendars, as last notified.

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "externalConflictKey" TEXT;
