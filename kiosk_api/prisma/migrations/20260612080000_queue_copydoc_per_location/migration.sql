-- Queue services per location
ALTER TABLE "queue_services" ADD COLUMN "locationId" TEXT;
ALTER TABLE "queue_services" DROP CONSTRAINT IF EXISTS "queue_services_code_key";
DROP INDEX IF EXISTS "queue_services_code_key";
CREATE UNIQUE INDEX "queue_services_locationId_code_key" ON "queue_services"("locationId","code");
CREATE INDEX "queue_services_locationId_idx" ON "queue_services"("locationId");
ALTER TABLE "queue_services" ADD CONSTRAINT "queue_services_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "kiosk_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Copy-doc categories per location
ALTER TABLE "copy_doc_categories" ADD COLUMN "locationId" TEXT;
ALTER TABLE "copy_doc_categories" DROP CONSTRAINT IF EXISTS "copy_doc_categories_code_key";
DROP INDEX IF EXISTS "copy_doc_categories_code_key";
CREATE UNIQUE INDEX "copy_doc_categories_locationId_code_key" ON "copy_doc_categories"("locationId","code");
CREATE INDEX "copy_doc_categories_locationId_idx" ON "copy_doc_categories"("locationId");
ALTER TABLE "copy_doc_categories" ADD CONSTRAINT "copy_doc_categories_locationId_fkey" FOREIGN KEY ("locationId") REFERENCES "kiosk_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
