-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('MEN', 'WOMEN', 'UNISEX', 'KID');

-- CreateEnum
CREATE TYPE "SourceScale" AS ENUM ('US', 'EU', 'UK', 'JP_MM', 'DOUBLE', 'MW_COMBINED');

-- CreateEnum
CREATE TYPE "Category" AS ENUM ('FOOTWEAR');

-- CreateEnum
CREATE TYPE "DisplayMode" AS ENUM ('SINGLE_SCALE', 'FULL_TABLE', 'MAIN_PLUS_TABLE');

-- CreateEnum
CREATE TYPE "FractionFormat" AS ENUM ('UNICODE', 'DECIMAL', 'ASCII');

-- AlterTable: extend Shop with settings + seededAt
ALTER TABLE "Shop"
  ADD COLUMN "seededAt" TIMESTAMP(3),
  ADD COLUMN "globalDisplayMode" "DisplayMode" NOT NULL DEFAULT 'MAIN_PLUS_TABLE',
  ADD COLUMN "globalScale" "SourceScale" NOT NULL DEFAULT 'EU',
  ADD COLUMN "marketScales" JSONB,
  ADD COLUMN "fractionFormat" "FractionFormat" NOT NULL DEFAULT 'UNICODE';

-- CreateTable
CREATE TABLE "SizeScale" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "sigla" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "Category" NOT NULL DEFAULT 'FOOTWEAR',
    "gender" "Gender" NOT NULL,
    "sourceScale" "SourceScale" NOT NULL,
    "labels" JSONB NOT NULL,
    "aliases" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SizeScale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversionTable" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "scaleSigla" TEXT NOT NULL,
    "brand" TEXT,
    "mappings" JSONB NOT NULL,
    "isSeed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConversionTable_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SizeScale_shopDomain_sigla_key" ON "SizeScale"("shopDomain", "sigla");
CREATE INDEX "SizeScale_shopDomain_idx" ON "SizeScale"("shopDomain");

-- CreateIndex
CREATE INDEX "ConversionTable_shopDomain_idx" ON "ConversionTable"("shopDomain");
CREATE INDEX "ConversionTable_shopDomain_scaleSigla_idx" ON "ConversionTable"("shopDomain", "scaleSigla");
CREATE INDEX "ConversionTable_shopDomain_scaleSigla_brand_idx" ON "ConversionTable"("shopDomain", "scaleSigla", "brand");

-- AddForeignKey
ALTER TABLE "SizeScale" ADD CONSTRAINT "SizeScale_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversionTable" ADD CONSTRAINT "ConversionTable_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;
