-- CreateEnum
CREATE TYPE "WorkflowAuthMethod" AS ENUM ('NONE', 'VNEID_QR', 'CCCD_CHIP', 'USERNAME_PASSWORD', 'OTP_SMS', 'SSO_TOKEN');

-- CreateEnum
CREATE TYPE "ScreenshotMode" AS ENUM ('NEVER', 'ON_ERROR', 'ON_EACH_STEP', 'ALWAYS');

-- CreateEnum
CREATE TYPE "WorkflowStepType" AS ENUM ('NAVIGATE', 'CLICK', 'FILL', 'SELECT', 'UPLOAD', 'WAIT', 'SCREENSHOT', 'ASSERT', 'EXTRACT', 'SCROLL', 'IFRAME_ENTER', 'IFRAME_EXIT', 'CAPTCHA_WAIT', 'CUSTOM_SCRIPT');

-- CreateEnum
CREATE TYPE "SelectorType" AS ENUM ('CSS', 'XPATH', 'ID', 'NAME', 'TEXT', 'LINK_TEXT');

-- CreateEnum
CREATE TYPE "StepAction" AS ENUM ('NONE', 'CLICK', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'FILL', 'CLEAR', 'SELECT_OPTION', 'HOVER', 'SCROLL_TO', 'KEY_PRESS', 'SUBMIT');

-- CreateEnum
CREATE TYPE "StepFailureAction" AS ENUM ('STOP', 'RETRY', 'SKIP', 'SCREENSHOT_STOP');

-- CreateEnum
CREATE TYPE "RunnerStatus" AS ENUM ('ONLINE', 'BUSY', 'OFFLINE', 'ERROR', 'DRAINING');

-- CreateEnum
CREATE TYPE "BrowserType" AS ENUM ('CHROMIUM', 'FIREFOX', 'WEBKIT');

-- CreateEnum
CREATE TYPE "SeleniumSessionStatus" AS ENUM ('CREATED', 'ACTIVE', 'COMPLETED', 'DESTROYED', 'ERROR');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'QUEUED', 'RUNNING', 'PAUSED', 'COMPLETED', 'FAILED', 'CANCELLED', 'RETRYING');

-- CreateEnum
CREATE TYPE "LogLevel" AS ENUM ('DEBUG', 'INFO', 'WARN', 'ERROR');

-- CreateEnum
CREATE TYPE "WorkerStatus" AS ENUM ('ONLINE', 'BUSY', 'OFFLINE', 'ERROR', 'DRAINING');

-- CreateEnum
CREATE TYPE "AIJobType" AS ENUM ('INTENT_DETECTION', 'PROCEDURE_MATCH', 'QA_RESPONSE', 'DOCUMENT_ANALYZE', 'DOCUMENT_BOUNDARY', 'OCR_EXTRACT', 'IMAGE_ENHANCE', 'TRANSLATION', 'SENTIMENT_ANALYSIS', 'SUMMARY');

-- CreateEnum
CREATE TYPE "CopyDocFeeType" AS ENUM ('FIXED', 'PROGRESSIVE', 'EXEMPT');

-- CreateEnum
CREATE TYPE "CopyRequestStatus" AS ENUM ('INITIATED', 'SCAN_PENDING', 'SCAN_IN_PROGRESS', 'SCAN_COMPLETE', 'AI_PROCESSING', 'PREVIEW_READY', 'ADJUSTED', 'FEE_PENDING', 'FEE_CONFIRMED', 'GENERATING_PDF', 'PRINT_QUEUED', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ScanSessionStatus" AS ENUM ('PENDING', 'CONNECTED', 'UPLOADING', 'COMPLETE', 'EXPIRED', 'ERROR');

-- CreateEnum
CREATE TYPE "PrintJobType" AS ENUM ('DOCUMENT_COPY', 'SUBMISSION_RECEIPT', 'QUEUE_TICKET', 'REPORT');

-- CreateEnum
CREATE TYPE "PrintStatus" AS ENUM ('QUEUED', 'READY_TO_PRINT', 'PRINTING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'VNPAY', 'MOMO', 'BANKING', 'WAIVED');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED', 'REFUNDED', 'WAIVED');

-- CreateTable
CREATE TABLE "workflow_templates" (
    "id" TEXT NOT NULL,
    "procedureId" TEXT,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "targetUrl" TEXT NOT NULL,
    "portalCode" TEXT,
    "authMethod" "WorkflowAuthMethod" NOT NULL DEFAULT 'NONE',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "timeoutSeconds" INTEGER NOT NULL DEFAULT 120,
    "maxRetries" INTEGER NOT NULL DEFAULT 2,
    "screenshotMode" "ScreenshotMode" NOT NULL DEFAULT 'ON_ERROR',
    "configJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "publishedAt" TIMESTAMP(3),
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workflow_steps" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stepType" "WorkflowStepType" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isRequired" BOOLEAN NOT NULL DEFAULT true,
    "url" TEXT,
    "waitFor" TEXT,
    "waitTimeoutMs" INTEGER NOT NULL DEFAULT 10000,
    "selector" TEXT,
    "selectorAlt" TEXT,
    "selectorType" "SelectorType" NOT NULL DEFAULT 'CSS',
    "action" "StepAction" NOT NULL DEFAULT 'NONE',
    "inputValue" TEXT,
    "inputMapping" JSONB,
    "uploadField" TEXT,
    "assertText" TEXT,
    "assertUrl" TEXT,
    "assertVisible" TEXT,
    "onFailure" "StepFailureAction" NOT NULL DEFAULT 'STOP',
    "retryCount" INTEGER NOT NULL DEFAULT 1,
    "delayAfterMs" INTEGER NOT NULL DEFAULT 500,
    "conditionExpr" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selenium_runners" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 4444,
    "status" "RunnerStatus" NOT NULL DEFAULT 'OFFLINE',
    "capacity" INTEGER NOT NULL DEFAULT 5,
    "activeSessions" INTEGER NOT NULL DEFAULT 0,
    "browserType" "BrowserType" NOT NULL DEFAULT 'CHROMIUM',
    "version" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "selenium_runners_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selenium_sessions" (
    "id" TEXT NOT NULL,
    "runnerId" TEXT NOT NULL,
    "kioskSessionId" TEXT NOT NULL,
    "browserContextId" TEXT,
    "status" "SeleniumSessionStatus" NOT NULL DEFAULT 'CREATED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "destroyedAt" TIMESTAMP(3),
    "cleanedAt" TIMESTAMP(3),

    CONSTRAINT "selenium_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selenium_jobs" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "seleniumSessionId" TEXT,
    "runnerId" TEXT,
    "applicationId" TEXT,
    "citizenId" TEXT,
    "kioskSessionId" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "inputData" JSONB,
    "outputData" JSONB,
    "currentStepId" TEXT,
    "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "selenium_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selenium_job_logs" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepOrder" INTEGER,
    "stepName" TEXT,
    "level" "LogLevel" NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "detail" JSONB,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selenium_job_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "selenium_screenshots" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stepOrder" INTEGER,
    "stepName" TEXT,
    "storagePath" TEXT NOT NULL,
    "bucketName" TEXT,
    "sizeBytes" INTEGER,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "selenium_screenshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_workers" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT,
    "port" INTEGER,
    "status" "WorkerStatus" NOT NULL DEFAULT 'OFFLINE',
    "capacity" INTEGER NOT NULL DEFAULT 10,
    "activeJobs" INTEGER NOT NULL DEFAULT 0,
    "modelType" TEXT,
    "capabilities" TEXT[],
    "version" TEXT,
    "lastHeartbeatAt" TIMESTAMP(3),
    "registeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalJobsHandled" INTEGER NOT NULL DEFAULT 0,
    "avgResponseMs" DOUBLE PRECISION,
    "errorRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ai_workers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_jobs" (
    "id" TEXT NOT NULL,
    "workerId" TEXT,
    "conversationId" TEXT,
    "sessionId" TEXT,
    "jobType" "AIJobType" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "inputPayload" JSONB NOT NULL,
    "outputPayload" JSONB,
    "modelUsed" TEXT,
    "tokensIn" INTEGER,
    "tokensOut" INTEGER,
    "responseTimeMs" INTEGER,
    "failReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "scheduledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_doc_categories" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "icon" TEXT,
    "colorHex" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "pricePerCopy" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "processingFeeRate" DECIMAL(5,4) NOT NULL DEFAULT 0.1,
    "maxCopiesPerRequest" INTEGER NOT NULL DEFAULT 10,
    "legalBasis" TEXT,
    "validityDays" INTEGER NOT NULL DEFAULT 0,
    "requiresStamp" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "copy_doc_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_doc_fee_rules" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ruleName" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL DEFAULT 1,
    "maxQuantity" INTEGER,
    "pricePerCopy" DECIMAL(15,2) NOT NULL,
    "feeType" "CopyDocFeeType" NOT NULL DEFAULT 'FIXED',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "effectiveFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effectiveTo" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_doc_fee_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "copy_doc_requests" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "citizenId" TEXT,
    "kioskDeviceId" TEXT,
    "requestCode" TEXT NOT NULL,
    "status" "CopyRequestStatus" NOT NULL DEFAULT 'INITIATED',
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "baseFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "processingFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "totalFee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "feeConfirmedAt" TIMESTAMP(3),
    "paymentRef" TEXT,
    "receiptCode" TEXT,
    "digitalDocId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "copy_doc_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mobile_scan_sessions" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "qrPayload" TEXT NOT NULL,
    "status" "ScanSessionStatus" NOT NULL DEFAULT 'PENDING',
    "mobileUA" TEXT,
    "mobileIp" TEXT,
    "connectedAt" TIMESTAMP(3),
    "uploadedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "scanImages" JSONB,
    "rawImagePaths" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mobile_scan_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "doc_ai_processing_jobs" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "aiJobId" TEXT,
    "jobType" "AIJobType" NOT NULL DEFAULT 'DOCUMENT_ANALYZE',
    "inputImagePath" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "detectedType" TEXT,
    "confidence" DOUBLE PRECISION,
    "boundaryPoints" JSONB,
    "enhancedPath" TEXT,
    "ocrText" TEXT,
    "metadata" JSONB,
    "errorMessage" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "doc_ai_processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "copyRequestId" TEXT,
    "kioskDeviceId" TEXT,
    "sessionId" TEXT,
    "jobType" "PrintJobType" NOT NULL DEFAULT 'DOCUMENT_COPY',
    "status" "PrintStatus" NOT NULL DEFAULT 'QUEUED',
    "filePath" TEXT,
    "copies" INTEGER NOT NULL DEFAULT 1,
    "printerName" TEXT,
    "printerStatus" TEXT,
    "sentAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "outputPageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fee_transactions" (
    "id" TEXT NOT NULL,
    "copyRequestId" TEXT,
    "transactionRef" TEXT NOT NULL,
    "citizenId" TEXT,
    "amount" DECIMAL(15,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'VND',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "confirmedAt" TIMESTAMP(3),
    "confirmedBy" TEXT,
    "receiptNumber" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fee_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "workflow_templates_code_key" ON "workflow_templates"("code");

-- CreateIndex
CREATE INDEX "workflow_templates_procedureId_idx" ON "workflow_templates"("procedureId");

-- CreateIndex
CREATE INDEX "workflow_steps_templateId_stepOrder_idx" ON "workflow_steps"("templateId", "stepOrder");

-- CreateIndex
CREATE UNIQUE INDEX "selenium_runners_runnerId_key" ON "selenium_runners"("runnerId");

-- CreateIndex
CREATE INDEX "selenium_sessions_runnerId_idx" ON "selenium_sessions"("runnerId");

-- CreateIndex
CREATE INDEX "selenium_sessions_kioskSessionId_idx" ON "selenium_sessions"("kioskSessionId");

-- CreateIndex
CREATE INDEX "selenium_jobs_status_scheduledAt_idx" ON "selenium_jobs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "selenium_jobs_kioskSessionId_idx" ON "selenium_jobs"("kioskSessionId");

-- CreateIndex
CREATE INDEX "selenium_jobs_runnerId_idx" ON "selenium_jobs"("runnerId");

-- CreateIndex
CREATE INDEX "selenium_job_logs_jobId_createdAt_idx" ON "selenium_job_logs"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "selenium_screenshots_jobId_idx" ON "selenium_screenshots"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "ai_workers_workerId_key" ON "ai_workers"("workerId");

-- CreateIndex
CREATE INDEX "ai_jobs_status_scheduledAt_idx" ON "ai_jobs"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "ai_jobs_workerId_idx" ON "ai_jobs"("workerId");

-- CreateIndex
CREATE INDEX "ai_jobs_jobType_idx" ON "ai_jobs"("jobType");

-- CreateIndex
CREATE UNIQUE INDEX "copy_doc_categories_code_key" ON "copy_doc_categories"("code");

-- CreateIndex
CREATE INDEX "copy_doc_fee_rules_categoryId_idx" ON "copy_doc_fee_rules"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "copy_doc_requests_requestCode_key" ON "copy_doc_requests"("requestCode");

-- CreateIndex
CREATE UNIQUE INDEX "copy_doc_requests_receiptCode_key" ON "copy_doc_requests"("receiptCode");

-- CreateIndex
CREATE INDEX "copy_doc_requests_sessionId_idx" ON "copy_doc_requests"("sessionId");

-- CreateIndex
CREATE INDEX "copy_doc_requests_status_idx" ON "copy_doc_requests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "mobile_scan_sessions_sessionToken_key" ON "mobile_scan_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "mobile_scan_sessions_requestId_idx" ON "mobile_scan_sessions"("requestId");

-- CreateIndex
CREATE INDEX "doc_ai_processing_jobs_requestId_idx" ON "doc_ai_processing_jobs"("requestId");

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- CreateIndex
CREATE INDEX "print_jobs_kioskDeviceId_idx" ON "print_jobs"("kioskDeviceId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_transactions_copyRequestId_key" ON "fee_transactions"("copyRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "fee_transactions_transactionRef_key" ON "fee_transactions"("transactionRef");

-- CreateIndex
CREATE UNIQUE INDEX "fee_transactions_receiptNumber_key" ON "fee_transactions"("receiptNumber");

-- CreateIndex
CREATE INDEX "fee_transactions_status_idx" ON "fee_transactions"("status");

-- CreateIndex
CREATE INDEX "fee_transactions_createdAt_idx" ON "fee_transactions"("createdAt");

-- AddForeignKey
ALTER TABLE "workflow_steps" ADD CONSTRAINT "workflow_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_sessions" ADD CONSTRAINT "selenium_sessions_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "selenium_runners"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_jobs" ADD CONSTRAINT "selenium_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "workflow_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_jobs" ADD CONSTRAINT "selenium_jobs_seleniumSessionId_fkey" FOREIGN KEY ("seleniumSessionId") REFERENCES "selenium_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_jobs" ADD CONSTRAINT "selenium_jobs_runnerId_fkey" FOREIGN KEY ("runnerId") REFERENCES "selenium_runners"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_job_logs" ADD CONSTRAINT "selenium_job_logs_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "selenium_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "selenium_screenshots" ADD CONSTRAINT "selenium_screenshots_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "selenium_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_jobs" ADD CONSTRAINT "ai_jobs_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "ai_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_doc_fee_rules" ADD CONSTRAINT "copy_doc_fee_rules_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "copy_doc_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "copy_doc_requests" ADD CONSTRAINT "copy_doc_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "copy_doc_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mobile_scan_sessions" ADD CONSTRAINT "mobile_scan_sessions_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "copy_doc_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "doc_ai_processing_jobs" ADD CONSTRAINT "doc_ai_processing_jobs_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "copy_doc_requests"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_copyRequestId_fkey" FOREIGN KEY ("copyRequestId") REFERENCES "copy_doc_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fee_transactions" ADD CONSTRAINT "fee_transactions_copyRequestId_fkey" FOREIGN KEY ("copyRequestId") REFERENCES "copy_doc_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;
