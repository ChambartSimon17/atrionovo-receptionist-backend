-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "customerId" TEXT;

-- CreateIndex
CREATE INDEX "idx_reservation_customer" ON "Reservation"("customerId");

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
