-- Billing: plan and subscription on the business, usage
-- (calls, SMS) with what it cost us, and invoices to the
-- business. Only adds; nothing is changed or removed.

-- CreateEnum
CREATE TYPE "BillingPlan" AS ENUM ('START', 'PRO', 'GROEI');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateEnum
CREATE TYPE "UsageKind" AS ENUM ('CALL', 'SMS');

-- CreateEnum
CREATE TYPE "UsageSource" AS ENUM ('RECEPTIONIST', 'CALL_SMS', 'LIVE_DEMO');

-- CreateEnum
CREATE TYPE "BillingInvoiceKind" AS ENUM ('SUBSCRIPTION', 'OVERAGE');

-- AlterTable
ALTER TABLE "Restaurant" ADD COLUMN     "billingInterval" "BillingInterval" NOT NULL DEFAULT 'MONTH',
ADD COLUMN     "billingPlan" "BillingPlan",
ADD COLUMN     "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isDemo" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeCustomerId" TEXT,
ADD COLUMN     "stripeSubscriptionId" TEXT,
ADD COLUMN     "subscriptionStatus" TEXT,
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UsageRecord" (
    "id" TEXT NOT NULL,
    "businessId" TEXT,
    "kind" "UsageKind" NOT NULL,
    "source" "UsageSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "costAmount" DECIMAL(12,6),
    "costCurrency" TEXT,
    "costBreakdown" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UsageRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingInvoice" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" "BillingInvoiceKind" NOT NULL,
    "stripeInvoiceId" TEXT,
    "usageMonth" TEXT,
    "number" TEXT,
    "status" TEXT NOT NULL,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'eur',
    "extraMinutes" INTEGER NOT NULL DEFAULT 0,
    "extraSms" INTEGER NOT NULL DEFAULT 0,
    "hostedInvoiceUrl" TEXT,
    "issuedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BillingInvoice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsageRecord_externalId_key" ON "UsageRecord"("externalId");

-- CreateIndex
CREATE INDEX "UsageRecord_businessId_occurredAt_idx" ON "UsageRecord"("businessId", "occurredAt");

-- CreateIndex
CREATE INDEX "UsageRecord_occurredAt_idx" ON "UsageRecord"("occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_stripeInvoiceId_key" ON "BillingInvoice"("stripeInvoiceId");

-- CreateIndex
CREATE INDEX "BillingInvoice_businessId_issuedAt_idx" ON "BillingInvoice"("businessId", "issuedAt");

-- CreateIndex
CREATE UNIQUE INDEX "BillingInvoice_businessId_usageMonth_key" ON "BillingInvoice"("businessId", "usageMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_stripeCustomerId_key" ON "Restaurant"("stripeCustomerId");

-- CreateIndex
CREATE UNIQUE INDEX "Restaurant_stripeSubscriptionId_key" ON "Restaurant"("stripeSubscriptionId");

-- AddForeignKey
ALTER TABLE "UsageRecord" ADD CONSTRAINT "UsageRecord_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillingInvoice" ADD CONSTRAINT "BillingInvoice_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

