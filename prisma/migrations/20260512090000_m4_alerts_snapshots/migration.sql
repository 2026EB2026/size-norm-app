-- CreateTable
CREATE TABLE "ConversionAlert" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "errorCode" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "ConversionAlert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductSnapshot" (
    "id" TEXT NOT NULL,
    "shopDomain" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ConversionAlert_shopDomain_idx" ON "ConversionAlert"("shopDomain");
CREATE INDEX "ConversionAlert_shopDomain_resolvedAt_idx" ON "ConversionAlert"("shopDomain", "resolvedAt");
CREATE INDEX "ConversionAlert_shopDomain_productId_idx" ON "ConversionAlert"("shopDomain", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "ProductSnapshot_shopDomain_productId_key" ON "ProductSnapshot"("shopDomain", "productId");
CREATE INDEX "ProductSnapshot_shopDomain_idx" ON "ProductSnapshot"("shopDomain");

-- AddForeignKey
ALTER TABLE "ConversionAlert" ADD CONSTRAINT "ConversionAlert_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductSnapshot" ADD CONSTRAINT "ProductSnapshot_shopDomain_fkey" FOREIGN KEY ("shopDomain") REFERENCES "Shop"("shopDomain") ON DELETE CASCADE ON UPDATE CASCADE;
