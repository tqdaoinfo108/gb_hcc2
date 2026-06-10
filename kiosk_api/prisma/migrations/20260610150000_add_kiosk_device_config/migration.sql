ALTER TABLE "kiosk_devices"
ADD COLUMN "deviceId" TEXT,
ADD COLUMN "name" TEXT,
ADD COLUMN "placement" TEXT,
ADD COLUMN "isEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "maintenanceMessage" TEXT;

UPDATE "kiosk_devices"
SET
  "deviceId" = "serialNumber",
  "name" = COALESCE("name", 'Kiosk ' || "serialNumber"),
  "placement" = COALESCE("placement", 'Chưa cấu hình');

ALTER TABLE "kiosk_devices"
ALTER COLUMN "deviceId" SET NOT NULL;

CREATE UNIQUE INDEX "kiosk_devices_deviceId_key" ON "kiosk_devices"("deviceId");

ALTER TABLE "kiosk_health_logs"
ADD COLUMN "temperatureC" DOUBLE PRECISION,
ADD COLUMN "ipAddress" TEXT,
ADD COLUMN "hostname" TEXT,
ADD COLUMN "os" TEXT,
ADD COLUMN "browser" TEXT,
ADD COLUMN "appVersion" TEXT,
ADD COLUMN "screenResolution" TEXT,
ADD COLUMN "userAgent" TEXT,
ADD COLUMN "currentScreen" TEXT,
ADD COLUMN "sessionId" TEXT;
