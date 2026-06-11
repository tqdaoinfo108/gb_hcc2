import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { AiRunnerHealth, AiRunnerStatus } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AiRunnerService } from './ai-runner.service';
import { getAdapter } from './ai-provider.adapter';

const CHECK_INTERVAL_MS = 30_000;

@Injectable()
export class AiHealthService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('AiHealth');
  private timer?: NodeJS.Timeout;

  constructor(
    private prisma: PrismaService,
    private runners: AiRunnerService,
  ) {}

  onModuleInit() {
    // Periodic active health probing (no external scheduler dependency)
    this.timer = setInterval(() => {
      this.checkAll().catch(e => this.logger.warn(`Health sweep failed: ${e?.message}`));
    }, CHECK_INTERVAL_MS);
    // Kick one off shortly after boot
    setTimeout(() => this.checkAll().catch(() => undefined), 4000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  /** Probe every enabled runner once. */
  async checkAll() {
    const runners = await this.prisma.aiRunner.findMany({
      where: { deletedAt: null, status: AiRunnerStatus.ENABLED },
    });
    await Promise.all(runners.map(r => this.checkOne(r.id).catch(() => undefined)));
  }

  /** Probe a single runner, persist a health log, update health state. */
  async checkOne(id: string) {
    const r = await this.prisma.aiRunner.findFirst({ where: { id, deletedAt: null } });
    if (!r) return null;

    const cfg = this.runners.toConfig(r);
    const adapter = getAdapter(r.provider);
    let ok = false, latencyMs: number | null = null, error: string | null = null;

    try {
      latencyMs = await adapter.probe(cfg);
      ok = true;
    } catch (e: any) {
      error = (e?.message ?? 'probe failed').slice(0, 300);
    }

    await this.prisma.aiRunnerHealthLog.create({
      data: { runnerId: id, ok, latencyMs: latencyMs ?? undefined, error: error ?? undefined },
    });

    if (ok) {
      const ema = r.latencyMs ? r.latencyMs * 0.7 + (latencyMs ?? 0) * 0.3 : latencyMs ?? 0;
      await this.prisma.aiRunner.update({
        where: { id },
        data: {
          health: AiRunnerHealth.HEALTHY,
          latencyMs: ema,
          consecutiveFails: 0,
          failureRate: Math.max(0, r.failureRate * 0.8),
          lastOkAt: new Date(),
          lastCheckAt: new Date(),
        },
      });
    } else {
      const fails = r.consecutiveFails + 1;
      await this.prisma.aiRunner.update({
        where: { id },
        data: {
          health: fails >= 3 ? AiRunnerHealth.UNHEALTHY : AiRunnerHealth.DEGRADED,
          consecutiveFails: fails,
          failureRate: Math.min(1, r.failureRate * 0.8 + 0.2),
          lastCheckAt: new Date(),
        },
      });
    }

    return { id, ok, latencyMs, error };
  }

  async recentLogs(runnerId: string, take = 50) {
    return this.prisma.aiRunnerHealthLog.findMany({
      where: { runnerId },
      orderBy: { checkedAt: 'desc' },
      take,
    });
  }
}
