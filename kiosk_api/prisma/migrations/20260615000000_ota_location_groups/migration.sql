-- OTA: Replace DeploymentGroup targeting with KioskLocation targeting.
-- Devices already belong to a location; no separate group entity needed.

-- 1. Clear old targetGroupId values (they pointed to deployment_groups, not kiosk_locations)
UPDATE ota_releases SET "targetGroupId" = NULL WHERE "targetGroupId" IS NOT NULL;

-- 2. Rename the column on ota_releases
ALTER TABLE ota_releases RENAME COLUMN "targetGroupId" TO "targetLocationId";

-- 3. Drop the old FK (points to deployment_groups)
ALTER TABLE ota_releases DROP CONSTRAINT IF EXISTS "ota_releases_targetGroupId_fkey";

-- 4. Add a new FK pointing to kiosk_locations
ALTER TABLE ota_releases ADD CONSTRAINT "ota_releases_targetLocationId_fkey"
  FOREIGN KEY ("targetLocationId") REFERENCES kiosk_locations(id)
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Drop the deploymentGroupId column from kiosk_devices
DROP INDEX IF EXISTS "kiosk_devices_deploymentGroupId_idx";
ALTER TABLE kiosk_devices DROP COLUMN IF EXISTS "deploymentGroupId";

-- 6. Remove deployment_groups (no more FK references after steps above)
DROP TABLE IF EXISTS deployment_groups;
