import { Injectable, NotFoundException } from '@nestjs/common';
import { WorkerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RegisterAIWorkerDto, AIWorkerHeartbeatDto } from './ai-worker.dto';

const WORKER_OFFLINE_THRESHOLD_MS = 45_000;

@Injectable()
export class AIWorkerService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeOffline = false) {
    return this.prisma.aIWorker.findMany({
      where: {
        deletedAt: null,
        ...(includeOffline ? {} : { status: { not: WorkerStatus.OFFLINE } }),
      },
      include: { _count: { select: { jobs: true } } },
      orderBy: [{ status: 'asc' }, { workerId: 'asc' }],
    });
  }

  async findById(id: string) {
    const worker = await this.prisma.aIWorker.findFirst({
      where: { deletedAt: null, OR: [{ id }, { workerId: id }] },
      include: {
        jobs: { where: { status: { in: ['RUNNING', 'QUEUED'] } }, take: 20 },
        _count: { select: { jobs: true } },
      },
    });
    if (!worker) throw new NotFoundException('AI worker not found');
    return worker;
  }

  async register(dto: RegisterAIWorkerDto) {
    return this.prisma.aIWorker.upsert({
      where: { workerId: dto.workerId.trim() },
      update: {
        name: dto.name.trim(),
        host: dto.host?.trim(),
        port: dto.port,
        capacity: dto.capacity ?? 10,
        modelType: dto.modelType?.trim(),
        capabilities: dto.capabilities ?? [],
        version: dto.version?.trim(),
        status: WorkerStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        deletedAt: null,
        metadata: dto.metadata as any,
      },
      create: {
        workerId: dto.workerId.trim(),
        name: dto.name.trim(),
        host: dto.host?.trim(),
        port: dto.port,
        capacity: dto.capacity ?? 10,
        modelType: dto.modelType?.trim(),
        capabilities: dto.capabilities ?? [],
        version: dto.version?.trim(),
        status: WorkerStatus.ONLINE,
        lastHeartbeatAt: new Date(),
        metadata: dto.metadata as any,
      },
    });
  }

  async heartbeat(workerId: string, dto: AIWorkerHeartbeatDto) {
    const worker = await this.findById(workerId);
    const activeJobs = dto.activeJobs ?? worker.activeJobs;
    const status = activeJobs >= worker.capacity
      ? WorkerStatus.BUSY
      : WorkerStatus.ONLINE;

    return this.prisma.aIWorker.update({
      where: { id: worker.id },
      data: {
        status,
        activeJobs,
        lastHeartbeatAt: new Date(),
        totalJobsHandled: dto.totalJobsHandled ?? worker.totalJobsHandled,
        avgResponseMs: dto.avgResponseMs ?? worker.avgResponseMs,
        errorRate: dto.errorRate ?? worker.errorRate,
        metadata: dto.metadata ? dto.metadata as any : worker.metadata,
      },
    });
  }

  async markOfflineStaleWorkers() {
    const threshold = new Date(Date.now() - WORKER_OFFLINE_THRESHOLD_MS);
    const updated = await this.prisma.aIWorker.updateMany({
      where: {
        deletedAt: null,
        status: { in: [WorkerStatus.ONLINE, WorkerStatus.BUSY] },
        lastHeartbeatAt: { lt: threshold },
      },
      data: { status: WorkerStatus.OFFLINE, activeJobs: 0 },
    });
    return updated.count;
  }

  /** Pick the best available worker for a given job type */
  async pickWorker(jobType: string, preferredWorkerId?: string) {
    if (preferredWorkerId) {
      const preferred = await this.prisma.aIWorker.findFirst({
        where: {
          deletedAt: null,
          workerId: preferredWorkerId,
          status: { in: [WorkerStatus.ONLINE, WorkerStatus.BUSY] },
          capabilities: { has: jobType },
        },
      });
      if (preferred && preferred.activeJobs < preferred.capacity) return preferred;
    }

    return this.prisma.aIWorker.findFirst({
      where: {
        deletedAt: null,
        status: { in: [WorkerStatus.ONLINE, WorkerStatus.BUSY] },
        capabilities: { has: jobType },
      },
      orderBy: [{ activeJobs: 'asc' }, { errorRate: 'asc' }, { avgResponseMs: 'asc' }],
    });
  }

  async drain(workerId: string) {
    const worker = await this.findById(workerId);
    return this.prisma.aIWorker.update({
      where: { id: worker.id },
      data: { status: WorkerStatus.DRAINING },
    });
  }

  async remove(workerId: string) {
    const worker = await this.findById(workerId);
    await this.prisma.aIWorker.update({
      where: { id: worker.id },
      data: { deletedAt: new Date(), status: WorkerStatus.OFFLINE },
    });
    return { deleted: true };
  }
}
