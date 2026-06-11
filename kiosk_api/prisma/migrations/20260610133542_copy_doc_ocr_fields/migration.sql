-- DropForeignKey
ALTER TABLE "copy_doc_requests" DROP CONSTRAINT "copy_doc_requests_categoryId_fkey";

-- AlterTable
ALTER TABLE "copy_doc_categories" ADD COLUMN     "ocrDocTypes" TEXT[],
ADD COLUMN     "ocrKeywords" TEXT[],
ADD COLUMN     "ocrMinScore" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "pdfTemplateName" TEXT;

-- AlterTable
ALTER TABLE "copy_doc_requests" ADD COLUMN     "detectedCategoryId" TEXT,
ADD COLUMN     "detectedTypeConfidence" DOUBLE PRECISION,
ADD COLUMN     "detectedTypeLabel" TEXT,
ADD COLUMN     "pdfPath" TEXT,
ADD COLUMN     "processedImagePath" TEXT,
ADD COLUMN     "rawImagePath" TEXT,
ALTER COLUMN "categoryId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "copy_doc_requests" ADD CONSTRAINT "copy_doc_requests_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "copy_doc_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;
