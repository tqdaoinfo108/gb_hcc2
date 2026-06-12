-- Audit log: nullable actor + richer columns
ALTER TABLE "admin_audit_logs" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "admin_audit_logs" ADD COLUMN "actorName" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "locationId" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "method" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "path" TEXT;
ALTER TABLE "admin_audit_logs" ADD COLUMN "statusCode" INTEGER;
CREATE INDEX IF NOT EXISTS "admin_audit_logs_locationId_idx" ON "admin_audit_logs"("locationId");

-- Per-user module access
CREATE TABLE "user_module_access" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "canManage" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_module_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_module_access_userId_module_key" ON "user_module_access"("userId","module");
CREATE INDEX "user_module_access_userId_idx" ON "user_module_access"("userId");
ALTER TABLE "user_module_access" ADD CONSTRAINT "user_module_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
