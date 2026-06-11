"use server";
import { revalidatePath } from "next/cache";
import { prisma } from "../lib/prisma";

/* ─── Category CRUD ─────────────────────────────────── */

export async function createCategory(formData: FormData) {
  const code           = (formData.get("code") as string).trim().toUpperCase();
  const name           = (formData.get("name") as string).trim();
  const nameEn         = (formData.get("nameEn") as string | null)?.trim() || null;
  const description    = (formData.get("description") as string | null)?.trim() || null;
  const icon           = (formData.get("icon") as string | null)?.trim() || null;
  const colorHex       = (formData.get("colorHex") as string | null)?.trim() || null;
  const pricePerCopy   = parseFloat(formData.get("pricePerCopy") as string) || 0;
  const processingFeeRate = parseFloat(formData.get("processingFeeRate") as string) || 0.1;
  const maxCopiesPerRequest = parseInt(formData.get("maxCopiesPerRequest") as string) || 10;
  const legalBasis     = (formData.get("legalBasis") as string | null)?.trim() || null;
  const validityDays   = parseInt(formData.get("validityDays") as string) || 0;
  const requiresStamp  = formData.get("requiresStamp") === "on";
  const ocrKeywordsRaw = (formData.get("ocrKeywords") as string | null)?.trim() || "";
  const ocrDocTypesRaw = (formData.get("ocrDocTypes") as string | null)?.trim() || "";
  const ocrMinScore    = parseInt(formData.get("ocrMinScore") as string) || 1;
  const pdfTemplateName = (formData.get("pdfTemplateName") as string | null)?.trim() || null;
  const sortOrder      = parseInt(formData.get("sortOrder") as string) || 0;

  const ocrKeywords = ocrKeywordsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const ocrDocTypes = ocrDocTypesRaw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  await prisma.copyDocCategory.create({
    data: {
      code, name, nameEn, description, icon, colorHex,
      pricePerCopy, processingFeeRate, maxCopiesPerRequest,
      legalBasis, validityDays, requiresStamp,
      ocrKeywords, ocrDocTypes, ocrMinScore, pdfTemplateName,
      sortOrder,
    },
  });

  revalidatePath("/copy-doc/categories");
}

export async function updateCategory(id: string, formData: FormData) {
  const name           = (formData.get("name") as string).trim();
  const nameEn         = (formData.get("nameEn") as string | null)?.trim() || null;
  const description    = (formData.get("description") as string | null)?.trim() || null;
  const icon           = (formData.get("icon") as string | null)?.trim() || null;
  const colorHex       = (formData.get("colorHex") as string | null)?.trim() || null;
  const pricePerCopy   = parseFloat(formData.get("pricePerCopy") as string) || 0;
  const processingFeeRate = parseFloat(formData.get("processingFeeRate") as string) || 0.1;
  const maxCopiesPerRequest = parseInt(formData.get("maxCopiesPerRequest") as string) || 10;
  const legalBasis     = (formData.get("legalBasis") as string | null)?.trim() || null;
  const validityDays   = parseInt(formData.get("validityDays") as string) || 0;
  const requiresStamp  = formData.get("requiresStamp") === "on";
  const isActive       = formData.get("isActive") === "on";
  const ocrKeywordsRaw = (formData.get("ocrKeywords") as string | null)?.trim() || "";
  const ocrDocTypesRaw = (formData.get("ocrDocTypes") as string | null)?.trim() || "";
  const ocrMinScore    = parseInt(formData.get("ocrMinScore") as string) || 1;
  const pdfTemplateName = (formData.get("pdfTemplateName") as string | null)?.trim() || null;
  const sortOrder      = parseInt(formData.get("sortOrder") as string) || 0;

  const ocrKeywords = ocrKeywordsRaw.split(",").map(s => s.trim()).filter(Boolean);
  const ocrDocTypes = ocrDocTypesRaw.split(",").map(s => s.trim().toUpperCase()).filter(Boolean);

  await prisma.copyDocCategory.update({
    where: { id },
    data: {
      name, nameEn, description, icon, colorHex,
      pricePerCopy, processingFeeRate, maxCopiesPerRequest,
      legalBasis, validityDays, requiresStamp, isActive,
      ocrKeywords, ocrDocTypes, ocrMinScore, pdfTemplateName,
      sortOrder,
    },
  });

  revalidatePath("/copy-doc/categories");
  revalidatePath(`/copy-doc/categories/${id}`);
}

export async function deleteCategory(id: string) {
  await prisma.copyDocCategory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/copy-doc/categories");
}

/* ─── Fee Rule CRUD ─────────────────────────────────── */

export async function addFeeRule(categoryId: string, formData: FormData) {
  await prisma.copyDocFeeRule.create({
    data: {
      categoryId,
      ruleName:    (formData.get("ruleName") as string).trim(),
      minQuantity: parseInt(formData.get("minQuantity") as string) || 1,
      maxQuantity: formData.get("maxQuantity") ? parseInt(formData.get("maxQuantity") as string) : null,
      pricePerCopy: parseFloat(formData.get("pricePerCopy") as string),
      feeType:     (formData.get("feeType") as never) || "FIXED",
    },
  });
  revalidatePath(`/copy-doc/categories/${categoryId}`);
}

export async function deleteFeeRule(categoryId: string, ruleId: string) {
  await prisma.copyDocFeeRule.delete({ where: { id: ruleId } });
  revalidatePath(`/copy-doc/categories/${categoryId}`);
}

/* ─── Request management ────────────────────────────── */

export async function cancelRequest(id: string) {
  await prisma.copyDocRequest.update({
    where: { id },
    data: { status: "CANCELLED" as never },
  });
  revalidatePath("/copy-doc/requests");
}
