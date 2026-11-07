-- CreateEnum
CREATE TYPE "SalesDocumentKind" AS ENUM ('RECEIPT', 'INVOICE', 'CREDIT_NOTE');

-- AlterTable
ALTER TABLE "Customer" ADD COLUMN     "billingCity" TEXT,
ADD COLUMN     "billingCountry" TEXT,
ADD COLUMN     "billingEmail" TEXT,
ADD COLUMN     "billingName" TEXT,
ADD COLUMN     "billingPostalCode" TEXT,
ADD COLUMN     "billingStreet" TEXT,
ADD COLUMN     "billingVatNumber" TEXT;

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "invoiceCity" TEXT,
ADD COLUMN     "invoiceCountry" TEXT NOT NULL DEFAULT 'BE',
ADD COLUMN     "invoiceEmail" TEXT,
ADD COLUMN     "invoiceIban" TEXT,
ADD COLUMN     "invoiceLegalName" TEXT,
ADD COLUMN     "invoicePostalCode" TEXT,
ADD COLUMN     "invoiceStreet" TEXT,
ADD COLUMN     "invoiceVatNumber" TEXT,
ADD COLUMN     "vatExempt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "vatRate" INTEGER NOT NULL DEFAULT 21;

-- CreateTable
CREATE TABLE "SalesDocument" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "paymentId" TEXT,
    "customerId" TEXT,
    "kind" "SalesDocumentKind" NOT NULL,
    "year" INTEGER NOT NULL,
    "sequence" INTEGER NOT NULL,
    "number" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "serviceDate" TIMESTAMP(3) NOT NULL,
    "seller" JSONB NOT NULL,
    "buyer" JSONB,
    "lines" JSONB NOT NULL,
    "netCents" INTEGER NOT NULL,
    "vatCents" INTEGER NOT NULL,
    "grossCents" INTEGER NOT NULL,
    "tipCents" INTEGER NOT NULL DEFAULT 0,
    "paymentMethod" TEXT,
    "relatedDocumentId" TEXT,
    "emailTo" TEXT,
    "emailedAt" TIMESTAMP(3),
    "emailError" TEXT,
    "peppolStatus" TEXT,
    "peppolId" TEXT,
    "peppolError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDocument_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SalesDocument_businessId_issuedAt_idx" ON "SalesDocument"("businessId", "issuedAt");

-- CreateIndex
CREATE INDEX "SalesDocument_paymentId_idx" ON "SalesDocument"("paymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SalesDocument_businessId_kind_year_sequence_key" ON "SalesDocument"("businessId", "kind", "year", "sequence");

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SalesDocument" ADD CONSTRAINT "SalesDocument_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
