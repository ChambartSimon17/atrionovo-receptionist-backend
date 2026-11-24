-- Confirmation SMS sent by the backend after a phone call.

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "smsSenderNumber" TEXT;

-- AlterTable
ALTER TABLE "CallLog" ADD COLUMN     "smsSentAt" TIMESTAMP(3);
