-- CreateTable
CREATE TABLE "copy_doc_pages" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "pageIndex" INTEGER NOT NULL,
    "rawImagePath" TEXT NOT NULL,
    "processedImagePath" TEXT,
    "ocrText" TEXT,
    "ocrOrientation" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copy_doc_pages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "copy_doc_pages_requestId_idx" ON "copy_doc_pages"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "copy_doc_pages_requestId_pageIndex_key" ON "copy_doc_pages"("requestId", "pageIndex");

-- AddForeignKey
ALTER TABLE "copy_doc_pages" ADD CONSTRAINT "copy_doc_pages_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "copy_doc_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;
