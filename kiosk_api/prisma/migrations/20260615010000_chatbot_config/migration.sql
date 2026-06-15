-- Citizen-facing AI chatbot configuration (singleton row).
CREATE TABLE "chatbot_configs" (
  "id" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "systemPrompt" TEXT NOT NULL,
  "welcomeMessage" TEXT,
  "fallbackMessage" TEXT,
  "temperature" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
  "maxTokens" INTEGER NOT NULL DEFAULT 512,
  "suggestedQuestions" TEXT[],
  "includeProcedureContext" BOOLEAN NOT NULL DEFAULT true,
  "primaryRunnerId" TEXT,
  "updatedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "chatbot_configs_pkey" PRIMARY KEY ("id")
);
