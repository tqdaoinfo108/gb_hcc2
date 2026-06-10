import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { ApplicationStatus, SessionStatus } from '@prisma/client';

@Injectable()
export class ReportingService {
  constructor(private prisma: PrismaService) {}

  async getDashboard() {
    const [totalSessions, totalApplications, totalSubmitted, avgFeedback] = await Promise.all([
      this.prisma.kioskSession.count({ where: { deletedAt: null } }),
      this.prisma.application.count({ where: { deletedAt: null } }),
      this.prisma.application.count({ where: { status: ApplicationStatus.SUBMITTED, deletedAt: null } }),
      this.prisma.feedback.aggregate({ _avg: { score: true }, where: { deletedAt: null } }),
    ]);
    return { totalSessions, totalApplications, totalSubmitted, avgSatisfactionScore: avgFeedback._avg.score };
  }

  async getApplicationStats(from: Date, to: Date) {
    return this.prisma.application.groupBy({
      by: ['status'],
      where: { createdAt: { gte: from, lte: to }, deletedAt: null },
      _count: { id: true },
    });
  }

  async getQueueStats(date: Date) {
    return this.prisma.queueDailyStatistic.findMany({
      where: { date },
      include: { service: true },
    });
  }

  async getKioskUptime() {
    return this.prisma.kioskDevice.findMany({
      where: { deletedAt: null },
      include: { healthLogs: { orderBy: { createdAt: 'desc' }, take: 1 } },
    });
  }
}
