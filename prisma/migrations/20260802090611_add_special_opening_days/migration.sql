-- CreateTable
CREATE TABLE "SpecialOpeningDay" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialOpeningDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpecialOpeningPeriod" (
    "id" TEXT NOT NULL,
    "specialOpeningDayId" TEXT NOT NULL,
    "opensAtMinutes" INTEGER NOT NULL,
    "closesAtMinutes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialOpeningPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SpecialOpeningDay_restaurantId_date_key" ON "SpecialOpeningDay"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "SpecialOpeningPeriod_specialOpeningDayId_idx" ON "SpecialOpeningPeriod"("specialOpeningDayId");

-- AddForeignKey
ALTER TABLE "SpecialOpeningDay" ADD CONSTRAINT "SpecialOpeningDay_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "Restaurant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialOpeningPeriod" ADD CONSTRAINT "SpecialOpeningPeriod_specialOpeningDayId_fkey" FOREIGN KEY ("specialOpeningDayId") REFERENCES "SpecialOpeningDay"("id") ON DELETE CASCADE ON UPDATE CASCADE;
