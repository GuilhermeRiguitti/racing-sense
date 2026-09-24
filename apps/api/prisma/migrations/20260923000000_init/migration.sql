-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('private', 'unlisted', 'public');

-- CreateTable
CREATE TABLE "Pilot" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "defaultVisibility" "Visibility" NOT NULL DEFAULT 'private',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pilot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedSession" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "trackName" TEXT NOT NULL,
    "trackConfig" TEXT,
    "trackLengthMeters" DOUBLE PRECISION,
    "carId" TEXT NOT NULL,
    "carName" TEXT NOT NULL,
    "driverName" TEXT,
    "sessionType" TEXT,
    "recordedAt" TIMESTAMP(3),
    "tickRate" INTEGER NOT NULL,
    "sampleCount" INTEGER NOT NULL,
    "conditions" JSONB NOT NULL,
    "bestLapTimeSeconds" DOUBLE PRECISION,
    "lapCount" INTEGER NOT NULL,
    "visibility" "Visibility" NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublishedSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PublishedLap" (
    "sessionId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "startSample" INTEGER NOT NULL,
    "endSample" INTEGER NOT NULL,
    "lapTimeSeconds" DOUBLE PRECISION,
    "isComplete" BOOLEAN NOT NULL,
    "flags" TEXT[],
    "series" JSONB NOT NULL,

    CONSTRAINT "PublishedLap_pkey" PRIMARY KEY ("sessionId","number")
);

-- CreateTable
CREATE TABLE "ShareLink" (
    "token" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("token")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pilot_email_key" ON "Pilot"("email");

-- CreateIndex
CREATE INDEX "PublishedSession_visibility_trackId_carId_idx" ON "PublishedSession"("visibility", "trackId", "carId");

-- CreateIndex
CREATE INDEX "PublishedSession_ownerId_idx" ON "PublishedSession"("ownerId");

-- CreateIndex
CREATE INDEX "ShareLink_sessionId_idx" ON "ShareLink"("sessionId");

-- AddForeignKey
ALTER TABLE "PublishedSession" ADD CONSTRAINT "PublishedSession_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Pilot"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PublishedLap" ADD CONSTRAINT "PublishedLap_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PublishedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "PublishedSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

