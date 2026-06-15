-- Make the chatbot config per-location: null locationId = global default,
-- a row with a locationId overrides the global config for that location.
ALTER TABLE "chatbot_configs" ADD COLUMN "locationId" TEXT;

CREATE UNIQUE INDEX "chatbot_configs_locationId_key" ON "chatbot_configs"("locationId");

ALTER TABLE "chatbot_configs" ADD CONSTRAINT "chatbot_configs_locationId_fkey"
  FOREIGN KEY ("locationId") REFERENCES "kiosk_locations"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
