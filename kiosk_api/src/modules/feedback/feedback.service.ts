import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { FeedbackTarget, SessionStatus } from '@prisma/client';
import { SubmitFeedbackDto } from './feedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private prisma: PrismaService) {}

  async submit(data: SubmitFeedbackDto) {
    const targetId = data.targetId?.trim() || undefined;
    const existing = await this.prisma.feedback.findFirst({
      where: {
        sessionId: data.sessionId,
        targetType: data.targetType,
        targetId: targetId ?? null,
        deletedAt: null,
      },
    });
    if (existing) return existing;

    const session = await this.prisma.kioskSession.findFirst({
      where: { id: data.sessionId, deletedAt: null },
      select: { id: true, citizenId: true, status: true },
    });
    if (!session) throw new NotFoundException('Kiosk session not found');
    if (session.status !== SessionStatus.ACTIVE) {
      throw new BadRequestException('Kiosk session is no longer active');
    }
    if (data.citizenId && session.citizenId && data.citizenId !== session.citizenId) {
      throw new BadRequestException('Citizen does not belong to this kiosk session');
    }

    const normalized = {
      citizenId: data.citizenId ?? session.citizenId ?? undefined,
      targetId,
      starRating: data.starRating ?? data.score,
      comment: data.comment?.trim() || undefined,
      tags: [...new Set((data.tags ?? []).map((tag) => tag.trim()).filter(Boolean))],
      language: data.language?.trim().toLowerCase() || 'vi',
    };

    return this.prisma.$transaction(async (tx) => {
      const feedback = await tx.feedback.create({
        data: {
          sessionId: data.sessionId,
          citizenId: normalized.citizenId,
          targetType: data.targetType,
          targetId: normalized.targetId,
          score: data.score,
          starRating: normalized.starRating,
          comment: normalized.comment,
          tags: normalized.tags,
          language: normalized.language,
        },
      });
      await tx.kioskSession.update({
        where: { id: data.sessionId },
        data: {
          status: SessionStatus.COMPLETED,
          currentScreen: 'feedback-complete',
          endTime: new Date(),
          lastActivityAt: new Date(),
        },
      });
      return feedback;
    });
  }

  async getStats(targetType?: FeedbackTarget) {
    const result = await this.prisma.feedback.aggregate({
      where: { deletedAt: null, ...(targetType ? { targetType } : {}) },
      _avg: { score: true, starRating: true },
      _count: { id: true },
    });
    return result;
  }

  async getRecent(limit = 20) {
    return this.prisma.feedback.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
