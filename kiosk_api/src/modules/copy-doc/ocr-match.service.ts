import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

export interface OcrMatchResult {
  categoryId: string;
  categoryName: string;
  docTypeLabel: string;
  confidence: number;       // 0.0 – 1.0
  matchedKeywords: string[];
  pricePerCopy: number;
}

/**
 * Normalise Vietnamese text for diacritic-insensitive matching.
 * OCR frequently mangles or drops Vietnamese diacritics, so we compare
 * everything with marks stripped: "Căn Cước" → "can cuoc".
 */
export function normalizeVi(s: string): string {
  return (s || '')
    .toLowerCase()
    // 1. Strip combining diacritical marks via explicit code-point range
    //    (literal mark characters in a regex are unreliable across editors)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    // 2. Map any remaining PRECOMPOSED Vietnamese letters that did not
    //    decompose, plus đ → d
    .replace(/[àáảãạăằắẳẵặâầấẩẫậ]/g, 'a')
    .replace(/[èéẻẽẹêềếểễệ]/g, 'e')
    .replace(/[ìíỉĩị]/g, 'i')
    .replace(/[òóỏõọôồốổỗộơờớởỡợ]/g, 'o')
    .replace(/[ùúủũụưừứửữự]/g, 'u')
    .replace(/[ỳýỷỹỵ]/g, 'y')
    .replace(/đ/g, 'd')
    // 3. Keep alphanumerics + MRZ filler '<' + spaces
    .replace(/[^a-z0-9<\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class OcrMatchService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Match OCR-extracted text against all active categories.
   * Returns the best match or null if confidence is too low.
   */
  async matchCategory(ocrText: string): Promise<OcrMatchResult | null> {
    const categories = await this.prisma.copyDocCategory.findMany({
      where: { isActive: true, deletedAt: null },
    });

    const normalised = normalizeVi(ocrText);
    let best: OcrMatchResult | null = null;

    for (const cat of categories) {
      const matched: string[] = [];

      // Keyword match (diacritic-insensitive)
      for (const kw of cat.ocrKeywords) {
        if (normalised.includes(normalizeVi(kw))) matched.push(kw);
      }

      // Doc type code match (higher weight)
      for (const dt of cat.ocrDocTypes) {
        if (normalised.includes(normalizeVi(dt))) matched.push(dt);
      }

      if (matched.length < (cat.ocrMinScore ?? 1)) continue;

      const totalTokens = cat.ocrKeywords.length + cat.ocrDocTypes.length;
      const confidence = Math.min(
        matched.length / Math.max(totalTokens, 1) + matched.length * 0.08,
        0.99,
      );

      if (!best || confidence > best.confidence) {
        best = {
          categoryId: cat.id,
          categoryName: cat.name,
          docTypeLabel: cat.name,
          confidence,
          matchedKeywords: matched,
          pricePerCopy: Number(cat.pricePerCopy),
        };
      }
    }

    return best;
  }

  /**
   * Simulate AI processing for demo purposes.
   * In production this would call an actual OCR/AI worker.
   */
  async simulateAiProcessing(requestId: string): Promise<{
    ocrText: string;
    corners: { x: number; y: number }[];
    matchResult: OcrMatchResult | null;
  }> {
    // Demo: use first active category
    const category = await this.prisma.copyDocCategory.findFirst({
      where: { isActive: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    // Simulated OCR text
    const demoTexts: Record<string, string> = {
      default:
        'CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\nCĂN CƯỚC CÔNG DÂN\nSố: 0012345678\nHọ và tên: NGUYỄN VĂN A\nNgày sinh: 01/01/1990\nNơi thường trú: Hà Nội',
    };

    const ocrText = demoTexts.default;

    // Simulated detected corners (slightly off from perfect rectangle)
    const corners = [
      { x: 0.04 + Math.random() * 0.04, y: 0.04 + Math.random() * 0.04 },
      { x: 0.93 + Math.random() * 0.04, y: 0.03 + Math.random() * 0.04 },
      { x: 0.94 + Math.random() * 0.04, y: 0.94 + Math.random() * 0.04 },
      { x: 0.03 + Math.random() * 0.04, y: 0.95 + Math.random() * 0.04 },
    ];

    let matchResult = await this.matchCategory(ocrText);

    // Fallback: if no category has OCR config, use first active category
    if (!matchResult && category) {
      matchResult = {
        categoryId: category.id,
        categoryName: category.name,
        docTypeLabel: category.name,
        confidence: 0.72 + Math.random() * 0.2,
        matchedKeywords: [],
        pricePerCopy: Number(category.pricePerCopy),
      };
    }

    return { ocrText, corners, matchResult };
  }
}
