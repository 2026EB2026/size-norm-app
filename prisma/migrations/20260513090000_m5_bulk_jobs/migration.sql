-- CreateEnum
CREATE TYPE "BulkJobType" AS ENUM ('FULL_RESCAN', 'RECONVERT_BY_SCALE', 'RECONVERT_BY_BRAND');

-- CreateEnum
CREATE TYPE "BulkJobStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "BulkJob" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "type" "BulkJobType" NOT NULL,
    "status" "BulkJobStatus" NOT NULL DEFAULT 'PENDING',
    "scaleSigla" TEXT,
    "brand" TEXT,
    "total" INTEGER NOT NULL DEFAULT 0,
    "processed" INTEGER NOT NULL DEFAULT 0,
    "errors" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,

    CONSTRAINT "BulkJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BulkJob_shopDomain_status_idx" ON "BulkJob"("shopDomain", "status");
CREATE INDEX "BulkJob_shopDomain_startedAt_idx" ON "BulkJob"("shopDomain", "startedAt");

-- AddForeignKey
ALTER TABLE "BulkJob" ADD CONSTRAINT "BulkJob_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;
