-- Restaurants settle a reservation: a payment can belong to one.
ALTER TABLE "Payment" ADD COLUMN "reservationId" TEXT;

CREATE INDEX "Payment_reservationId_idx" ON "Payment"("reservationId");

ALTER TABLE "Payment" ADD CONSTRAINT "Payment_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
