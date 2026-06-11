-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "WorkflowStepType" ADD VALUE 'OPEN_URL';
ALTER TYPE "WorkflowStepType" ADD VALUE 'CLICK_MENU';
ALTER TYPE "WorkflowStepType" ADD VALUE 'SEARCH_PROCEDURE';
ALTER TYPE "WorkflowStepType" ADD VALUE 'SELECT_RESULT';
ALTER TYPE "WorkflowStepType" ADD VALUE 'WAIT_VNEID_LOGIN';
ALTER TYPE "WorkflowStepType" ADD VALUE 'INPUT_FIELD';
ALTER TYPE "WorkflowStepType" ADD VALUE 'SELECT_OPTION';
ALTER TYPE "WorkflowStepType" ADD VALUE 'UPLOAD_DOCUMENT';
ALTER TYPE "WorkflowStepType" ADD VALUE 'WAIT_SUBMIT';
ALTER TYPE "WorkflowStepType" ADD VALUE 'DETECT_SUCCESS_TEXT';
ALTER TYPE "WorkflowStepType" ADD VALUE 'EXTRACT_APPLICATION_CODE';
ALTER TYPE "WorkflowStepType" ADD VALUE 'COMPLETE';
