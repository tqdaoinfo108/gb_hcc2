import { Injectable, NotFoundException } from '@nestjs/common';
import { AIJobType, JobStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AIWorkerService } from './ai-worker.service';
import { DispatchAIJobDto, CompleteAIJobDto } from './ai-worker.dto';

@Injectable()
export class AIJobService {
  constructor(
    private prisma: PrismaService,
    private workers: AIWorkerService,
  ) {}

  async findAll(filter?: { status?: JobStatus; workerId?: string; jobType?: AIJobType; limit?: number }) {
    return this.prisma.aIJob.findMany({
      where: {
        status: filter?.status,
        workerId: filter?.workerId,
        jobType: filter?.jobType,
      },
      include: {
        worker: { select: { id: true, workerId: true, name: true, modelType: true } },
      },
      orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      take: filter?.limit ?? 50,
    });
  }

  async findById(id: string) {
    const job = await this.prisma.aIJob.findFirst({
      where: { id },
      include: { worker: true },
    });
    if (!job) throw new NotFoundException('AI job not found');
    return job;
  }

  async dispatch(dto: DispatchAIJobDto) {
    // Pick worker based on job type
    const worker = await this.workers.pickWorker(dto.jobType, dto.preferredWorkerId);

    const job = await this.prisma.aIJob.create({
      data: {
        workerId: worker?.id ?? null,
        jobType: dto.jobType,
        status: worker ? JobStatus.QUEUED : JobStatus.PENDING,
        priority: dto.priority ?? 5,
        inputPayload: dto.inputPayload as Prisma.InputJsonValue,
        sessionId: dto.sessionId,
        conversationId: dto.conversationId,
      },
      include: {
        worker: { select: { id: true, workerId: true, name: true, modelType: true } },
      },
    });

    if (worker) {
      await this.prisma.aIWorker.update({
        where: { id: worker.id },
        data: { activeJobs: { increment: 1 } },
      });
    }

    return job;
  }

  async markRunning(id: string) {
    const job = await this.findById(id);
    return this.prisma.aIJob.update({
      where: { id: job.id },
      data: { status: JobStatus.RUNNING, startedAt: new Date() },
    });
  }

  async complete(id: string, dto: CompleteAIJobDto) {
    const job = await this.findById(id);
    const now = new Date();

    const data: Prisma.AIJobUpdateInput = {
      status: dto.status,
      modelUsed: dto.modelUsed,
      tokensIn: dto.tokensIn,
      tokensOut: dto.tokensOut,
      responseTimeMs: dto.responseTimeMs,
      failReason: dto.failReason,
    };

    if (dto.outputPayload) data.outputPayload = dto.outputPayload as Prisma.InputJsonValue;
    if (dto.status === JobStatus.COMPLETED) data.completedAt = now;
    if (dto.status === JobStatus.FAILED) {
      data.retryCount = { increment: 1 };
    }

    // Decrement worker load
    if (job.workerId) {
      await this.prisma.aIWorker.update({
        where: { id: job.workerId },
        data: {
          activeJobs: { decrement: 1 },
          totalJobsHandled: dto.status === JobStatus.COMPLETED ? { increment: 1 } : undefined,
        },
      });
    }

    return this.prisma.aIJob.update({ where: { id: job.id }, data });
  }

  async retry(id: string) {
    const job = await this.findById(id);
    if (!([JobStatus.FAILED, JobStatus.CANCELLED] as string[]).includes(job.status)) {
      throw new Error('Only FAILED or CANCELLED jobs can be retried');
    }
    const worker = await this.workers.pickWorker(job.jobType as string);
    return this.prisma.aIJob.update({
      where: { id: job.id },
      data: {
        status: worker ? JobStatus.QUEUED : JobStatus.PENDING,
        workerId: worker?.id ?? job.workerId,
        failReason: null,
        startedAt: null,
        completedAt: null,
        scheduledAt: new Date(),
      },
    });
  }

  /** Worker polling endpoint — gets pending jobs for a given worker */
  async dequeueForWorker(workerId: string, limit = 5) {
    const worker = await this.workers.findById(workerId);
    return this.prisma.aIJob.findMany({
      where: { workerId: worker.id, status: JobStatus.QUEUED },
      orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      take: limit,
    });
  }
}
