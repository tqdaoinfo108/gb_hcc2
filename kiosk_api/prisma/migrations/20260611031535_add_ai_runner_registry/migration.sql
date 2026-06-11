-- CreateEnum
CREATE TYPE "AiProvider" AS ENUM ('OLLAMA', 'GEMINI', 'OPENAI_COMPAT', 'PRIVATE');

-- CreateEnum
CREATE TYPE "AiRunnerStatus" AS ENUM ('ENABLED', 'DISABLED');

-- CreateEnum
CREATE TYPE "AiRunnerHealth" AS ENUM ('HEALTHY', 'DEGRADED', 'UNHEALTHY', 'UNKNOWN');

-- CreateTable
CREATE TABLE "ai_runners" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" "AiProvider" NOT NULL,
    "endpoint" TEXT NOT NULL,
    "modelName" TEXT NOT NULL,
    "authKey" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 5,
    "timeoutMs" INTEGER NOT NULL DEFAULT 30000,
    "maxConcurrent" INTEGER NOT NULL DEFAULT 4,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "capabilities" TEXT[],
    "status" "AiRunnerStatus" NOT NULL DEFAULT 'ENABLED',
    "health" "AiRunnerHealth" NOT NULL DEFAULT 'UNKNOWN',
    "latencyMs" DOUBLE PRECISION,
    "failureRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastCheckAt" TIMESTAMP(3),
    "lastOkAt" TIMESTAMP(3),
    "consecutiveFails" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ai_runners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runner_health_logs" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "latencyMs" DOUBLE PRECISION,
    "httpStatus" INTEGER,
    "error" TEXT,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_runner_health_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_runners_status_health_priority_idx" ON "ai_runners"("status", "health", "priority");

-- CreateIndex
CREATE INDEX "ai_runner_health_logs_runnerId_checkedAt_idx" ON "ai_runner_health_logs"("runnerId", "checkedAt");

-- AddForeignKey
ALTER TABLE "ai_runner_health_logs" ADD CONSTRAINT "ai_runner_health_logs_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "ai_runners"("id") ON DELETE CASCADE ON UPDATE CASCADE;
