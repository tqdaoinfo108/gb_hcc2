import { Injectable, NotFoundException } from '@nestjs/common';
import { AiRunner, AiRunnerHealth, AiRunnerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { encryptSecret, decryptSecret, maskSecret } from '../../common/crypto.util';
import { RunnerConfig } from './ai-provider.adapter';
import { CreateAiRunnerDto, UpdateAiRunnerDto } from './ai-gateway.dto';

@Injectable()
export class AiRunnerService {
  constructor(private prisma: PrismaService) {}

  /* ── CMS CRUD ──────────────────────────────────────── */

  /** List runners with auth keys masked (never expose secrets to CMS). */
  async findAll() {
    const runners = await this.prisma.aiRunner.findMany({
      where: { deletedAt: null },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    return runners.map(r => ({ ...r, authKey: maskSecret(r.authKey) }));
  }

  async findById(id: string) {
    const r = await this.prisma.aiRunner.findFirst({ where: { id, deletedAt: null } });
    if (!r) throw new NotFoundException('AI runner not found');
    return { ...r, authKey: maskSecret(r.authKey) };
  }

  async create(dto: CreateAiRunnerDto) {
    const r = await this.prisma.aiRunner.create({
      data: {
        name: dto.name.trim(),
        provider: dto.provider,
        endpoint: dto.endpoint.trim(),
        modelName: dto.modelName.trim(),
        authKey: dto.authKey ? encryptSecret(dto.authKey) : null,
        priority: dto.priority ?? 5,
        timeoutMs: dto.timeoutMs ?? 30000,
        maxConcurrent: dto.maxConcurrent ?? 4,
        capabilities: dto.capabilities ?? ['INTENT_DETECTION', 'QA_RESPONSE', 'PROCEDURE_MATCH'],
        config: (dto.config as any) ?? undefined,
      },
    });
    return { ...r, authKey: maskSecret(r.authKey) };
  }

  async update(id: string, dto: UpdateAiRunnerDto) {
    const existing = await this.prisma.aiRunner.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('AI runner not found');
    const r = await this.prisma.aiRunner.update({
      where: { id },
      data: {
        name: dto.name?.trim(),
        provider: dto.provider,
        endpoint: dto.endpoint?.trim(),
        modelName: dto.modelName?.trim(),
        // Only overwrite the key when a real new value is provided (not the mask)
        ...(dto.authKey && dto.authKey !== '••••••••'
          ? { authKey: encryptSecret(dto.authKey) } : {}),
        priority: dto.priority,
        timeoutMs: dto.timeoutMs,
        maxConcurrent: dto.maxConcurrent,
        capabilities: dto.capabilities,
        status: dto.status,
        config: dto.config as any,
        version: { increment: 1 },
      },
    });
    return { ...r, authKey: maskSecret(r.authKey) };
  }

  async remove(id: string) {
    const existing = await this.prisma.aiRunner.findFirst({ where: { id, deletedAt: null } });
    if (!existing) throw new NotFoundException('AI runner not found');
    await this.prisma.aiRunner.update({
      where: { id }, data: { deletedAt: new Date(), status: AiRunnerStatus.DISABLED },
    });
    return { deleted: true };
  }

  /* ── Router + execution support ────────────────────── */

  /** Decrypted runtime config for adapters. */
  toConfig(r: AiRunner): RunnerConfig {
    return {
      provider: r.provider,
      endpoint: r.endpoint,
      modelName: r.modelName,
      authKey: decryptSecret(r.authKey),
      timeoutMs: r.timeoutMs,
    };
  }

  /**
   * AI ROUTER — pick the best healthy runner for a capability.
   * score = priority*100 + latency/50 + failureRate*200 + load*50  (lowest wins)
   * `exclude` lets the fallback loop skip already-failed runners.
   */
  async pickRunner(capability: string, exclude: string[] = []): Promise<AiRunner | null> {
    const candidates = await this.prisma.aiRunner.findMany({
      where: {
        deletedAt: null,
        status: AiRunnerStatus.ENABLED,
        health: { not: AiRunnerHealth.UNHEALTHY },
        capabilities: { has: capability },
        id: exclude.length ? { notIn: exclude } : undefined,
      },
    });
    const available = candidates.filter(r => r.activeJobs < r.maxConcurrent);
    if (available.length === 0) return null;

    const score = (r: AiRunner) =>
      r.priority * 100 +
      (r.latencyMs ?? 1000) / 50 +
      r.failureRate * 200 +
      (r.activeJobs / Math.max(1, r.maxConcurrent)) * 50;

    return available.sort((a, b) => {
      const d = score(a) - score(b);
      if (d !== 0) return d;
      if (a.activeJobs !== b.activeJobs) return a.activeJobs - b.activeJobs;
      return (b.lastOkAt?.getTime() ?? 0) - (a.lastOkAt?.getTime() ?? 0);
    })[0];
  }

  async incLoad(id: string) {
    await this.prisma.aiRunner.update({ where: { id }, data: { activeJobs: { increment: 1 } } });
  }

  async decLoad(id: string) {
    await this.prisma.aiRunner.updateMany({
      where: { id, activeJobs: { gt: 0 } }, data: { activeJobs: { decrement: 1 } },
    });
  }

  /** Record a successful execution: refresh latency, reset fail counters. */
  async recordSuccess(id: string, latencyMs: number) {
    const r = await this.prisma.aiRunner.findUnique({ where: { id } });
    if (!r) return;
    const ema = r.latencyMs ? r.latencyMs * 0.7 + latencyMs * 0.3 : latencyMs;
    await this.prisma.aiRunner.update({
      where: { id },
      data: {
        latencyMs: ema,
        failureRate: Math.max(0, r.failureRate * 0.8),
        consecutiveFails: 0,
        health: AiRunnerHealth.HEALTHY,
        lastOkAt: new Date(),
        lastCheckAt: new Date(),
      },
    });
  }

  /** Record a failure: bump failure rate; auto-disable after 3 consecutive. */
  async recordFailure(id: string) {
    const r = await this.prisma.aiRunner.findUnique({ where: { id } });
    if (!r) return;
    const fails = r.consecutiveFails + 1;
    await this.prisma.aiRunner.update({
      where: { id },
      data: {
        failureRate: Math.min(1, r.failureRate * 0.8 + 0.2),
        consecutiveFails: fails,
        health: fails >= 3 ? AiRunnerHealth.UNHEALTHY : AiRunnerHealth.DEGRADED,
        lastCheckAt: new Date(),
      },
    });
  }
}
