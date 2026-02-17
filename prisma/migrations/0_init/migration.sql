-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "VtoEventType" AS ENUM ('REDIRECT_OUT', 'VTO_JOB_REQUEST', 'VTO_JOB_SUCCESS', 'VTO_JOB_FAILURE');

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "scope" TEXT,
    "expires" TIMESTAMP(3),
    "accessToken" TEXT NOT NULL,
    "userId" BIGINT,
    "firstName" TEXT,
    "lastName" TEXT,
    "email" TEXT,
    "accountOwner" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "collaborator" BOOLEAN DEFAULT false,
    "emailVerified" BOOLEAN DEFAULT false,
    "refreshToken" TEXT,
    "refreshTokenExpires" TIMESTAMP(3),

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShopSettings" (
    "shop" TEXT NOT NULL,
    "vtoBaseUrl" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "planTier" "PlanTier" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShopSettings_pkey" PRIMARY KEY ("shop")
);

-- CreateTable
CREATE TABLE "ApiCallLog" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "eventType" "VtoEventType" NOT NULL,
    "isSuccess" BOOLEAN NOT NULL,
    "requestId" TEXT,
    "message" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ApiCallLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductVtoConfig" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productTitle" TEXT NOT NULL,
    "productImage" TEXT,
    "selectedImageId" TEXT NOT NULL,
    "selectedImageUrl" TEXT NOT NULL,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductVtoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingStatus" (
    "shop" TEXT NOT NULL,
    "productsSelected" BOOLEAN NOT NULL DEFAULT false,
    "imagesSelected" BOOLEAN NOT NULL DEFAULT false,
    "isComplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OnboardingStatus_pkey" PRIMARY KEY ("shop")
);

-- CreateIndex
CREATE INDEX "ApiCallLog_shop_createdAt_idx" ON "ApiCallLog"("shop", "createdAt");

-- CreateIndex
CREATE INDEX "ApiCallLog_shop_eventType_createdAt_idx" ON "ApiCallLog"("shop", "eventType", "createdAt");

-- CreateIndex
CREATE INDEX "ProductVtoConfig_shop_idx" ON "ProductVtoConfig"("shop");

-- CreateIndex
CREATE INDEX "ProductVtoConfig_shop_isEnabled_idx" ON "ProductVtoConfig"("shop", "isEnabled");

-- CreateIndex
CREATE UNIQUE INDEX "ProductVtoConfig_shop_productId_key" ON "ProductVtoConfig"("shop", "productId");

