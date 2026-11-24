-- Vapi multi-tenant routing: find the business by the called
-- Vapi number, a fallback number per business and the words
-- the transcriber must recognise.

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "fallbackPhoneNumber" TEXT,
ADD COLUMN     "transcriberKeyterms" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "vapiPhoneNumberId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_vapiPhoneNumberId_key" ON "Restaurant"("vapiPhoneNumberId");
