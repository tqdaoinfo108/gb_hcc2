-- OTA Update Management Platform

-- Enums
CREATE TYPE "OtaChannel" AS ENUM ('STABLE', 'BETA');
CREATE TYPE "OtaReleaseStatus" AS ENUM ('DRAFT', 'ROLLING', 'PAUSED', 'COMPLETED', 'ROLLED_BACK');
CREATE TYPE "OtaUpdateStatus" AS ENUM ('PENDING', 'NOTIFIED', 'DOWNLOADING', 'DOWNLOADED', 'INSTALLING', 'INSTALLED', 'FAILED', 'ROLLED_BACK');

-- Deployment groups
CREATE TABLE "deployment_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "deployment_groups_pkey" PRIMARY KEY ("id")
);

-- OTA releases
CREATE TABLE "ota_releases" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "channel" "OtaChannel" NOT NULL DEFAULT 'STABLE',
    "notes" TEXT,
    "isMandatory" BOOLEAN NOT NULL DEFAULT false,
    "rolloutPercent" INTEGER NOT NULL DEFAULT 100,
    "status" "OtaReleaseStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduledAt" TIMESTAMP(3),
    "autoRollback" BOOLEAN NOT NULL DEFAULT true,
    "failureThreshold" INTEGER NOT NULL DEFAULT 20,
    "targetGroupId" TEXT,
    "fileName" TEXT,
    "filePath" TEXT,
    "fileSize" INTEGER,
    "sha256" TEXT,
    "signature" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "ota_releases_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ota_releases_status_idx" ON "ota_releases"("status");
CREATE INDEX "ota_releases_channel_idx" ON "ota_releases"("channel");

-- Per-device update records
CREATE TABLE "ota_updates" (
    "id" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "releaseId" TEXT NOT NULL,
    "status" "OtaUpdateStatus" NOT NULL DEFAULT 'PENDING',
    "fromVersion" TEXT,
    "toVersion" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ota_updates_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ota_updates_deviceId_releaseId_key" ON "ota_updates"("deviceId", "releaseId");
CREATE INDEX "ota_updates_releaseId_idx" ON "ota_updates"("releaseId");
CREATE INDEX "ota_updates_status_idx" ON "ota_updates"("status");

-- KioskDevice OTA columns
ALTER TABLE "kiosk_devices" ADD COLUMN "appVersion" TEXT;
ALTER TABLE "kiosk_devices" ADD COLUMN "deploymentGroupId" TEXT;
CREATE INDEX "kiosk_devices_deploymentGroupId_idx" ON "kiosk_devices"("deploymentGroupId");

-- Foreign keys
ALTER TABLE "kiosk_devices" ADD CONSTRAINT "kiosk_devices_deploymentGroupId_fkey" FOREIGN KEY ("deploymentGroupId") REFERENCES "deployment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ota_releases" ADD CONSTRAINT "ota_releases_targetGroupId_fkey" FOREIGN KEY ("targetGroupId") REFERENCES "deployment_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "kiosk_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ota_updates" ADD CONSTRAINT "ota_updates_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "ota_releases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
