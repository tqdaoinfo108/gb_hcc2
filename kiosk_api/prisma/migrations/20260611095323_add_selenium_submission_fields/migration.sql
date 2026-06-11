-- AlterTable
ALTER TABLE "selenium_jobs" ADD COLUMN     "applicationCode" TEXT,
ADD COLUMN     "submittedDeviceSerial" TEXT;

-- CreateIndex
CREATE INDEX "selenium_jobs_submittedDeviceSerial_idx" ON "selenium_jobs"("submittedDeviceSerial");

-- CreateIndex
CREATE INDEX "selenium_jobs_applicationCode_idx" ON "selenium_jobs"("applicationCode");
