-- Per-location home services (locationId NULL = global default)
ALTER TABLE "kiosk_home_services" ADD COLUMN "locationId" TEXT;

ALTER TABLE "kiosk_home_services" DROP CONSTRAINT IF EXISTS "kiosk_home_services_code_key";
DROP INDEX IF EXISTS "kiosk_home_services_code_key";

CREATE UNIQUE INDEX "kiosk_home_services_locationId_code_key" ON "kiosk_home_services"("locationId", "code");
CREATE INDEX "kiosk_home_services_locationId_idx" ON "kiosk_home_services"("locationId");

ALTER TABLE "kiosk_home_services"
  ADD CONSTRAINT "kiosk_home_services_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "kiosk_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
