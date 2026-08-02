/*
  Warnings:

  - You are about to drop the column `maxPartySize` on the `Restaurant` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Restaurant" DROP COLUMN "maxPartySize",
ADD COLUMN     "maxReservationSize" INTEGER NOT NULL DEFAULT 8;
