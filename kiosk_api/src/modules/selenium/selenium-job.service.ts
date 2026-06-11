import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { SeleniumRunnerService } from './selenium-runner.service';
import { CitizenInputDto, DispatchJobDto, UpdateJobStatusDto, AddJobLogDto, AddScreenshotDto } from './selenium.dto';

/** In-memory store for pending citizen input per jobId */
const citizenInputStore = new Map<string, CitizenInputDto | 'waiting'>();

/** Interaction events (taps/keys/scroll) queued from kiosk → drained by runner */
export interface InteractionEvent {
  type: 'click' | 'touchStart' | 'touchMove' | 'touchEnd' | 'type' | 'key' | 'scroll' | 'finish';
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  deltaX?: number;
  deltaY?: number;
}
const interactionStore = new Map<string, InteractionEvent[]>();
/** Cache deviceSerial per job to avoid a DB hit on every focus report */
const jobDeviceCache = new Map<string, string>();

@Injectable()
export class SeleniumJobService {
  constructor(
    private prisma: PrismaService,
    private realtime: RealtimeService,
    private runners: SeleniumRunnerService,
  ) {}

  async findAll(filter?: { status?: JobStatus; runnerId?: string; kioskSessionId?: string; limit?: number }) {
    return this.prisma.seleniumJob.findMany({
      where: {
        status: filter?.status,
        runnerId: filter?.runnerId,
        kioskSessionId: filter?.kioskSessionId,
      },
      include: {
        template: { select: { id: true, code: true, name: true } },
        runner: { select: { id: true, runnerId: true, name: true } },
        _count: { select: { logs: true, screenshots: true } },
      },
      orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      take: filter?.limit ?? 50,
    });
  }

  async findById(id: string) {
    const job = await this.prisma.seleniumJob.findFirst({
      where: { id },
      include: {
        template: {
          include: { steps: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' } } },
        },
        runner: true,
        seleniumSession: true,
        logs: { orderBy: { createdAt: 'asc' }, take: 200 },
        screenshots: { orderBy: { capturedAt: 'asc' } },
      },
    });
    if (!job) throw new NotFoundException('Selenium job not found');
    return job;
  }

  async dispatch(dto: DispatchJobDto) {
    // Pick a runner
    const runner = await this.runners.pickRunner();

    // Create a selenium session on the runner if we have one
    let seleniumSession = null;
    if (runner && dto.kioskSessionId) {
      seleniumSession = await this.prisma.seleniumSession.create({
        data: {
          runnerId: runner.id,
          kioskSessionId: dto.kioskSessionId,
        },
      });
    }

    // Merge deviceSerial into inputData so progress events know where to push
    const mergedInput: Record<string, unknown> = {
      ...(dto.inputData ?? {}),
      ...(dto.deviceSerial ? { deviceSerial: dto.deviceSerial } : {}),
    };

    const job = await this.prisma.seleniumJob.create({
      data: {
        templateId: dto.templateId,
        runnerId: runner?.id,
        seleniumSessionId: seleniumSession?.id,
        kioskSessionId: dto.kioskSessionId,
        applicationId: dto.applicationId,
        citizenId: dto.citizenId,
        priority: dto.priority ?? 5,
        status: runner ? JobStatus.QUEUED : JobStatus.PENDING,
        inputData: mergedInput as Prisma.InputJsonValue,
      },
      include: {
        template: { select: { id: true, code: true, name: true } },
        runner: { select: { id: true, runnerId: true, name: true } },
      },
    });

    if (runner) {
      // Increment runner active sessions
      await this.prisma.seleniumRunner.update({
        where: { id: runner.id },
        data: { activeSessions: { increment: 1 } },
      });
    }

    // Cache deviceSerial for fast interactive-focus push
    if (dto.deviceSerial) jobDeviceCache.set(job.id, dto.deviceSerial);

    return job;
  }

  async updateStatus(id: string, dto: UpdateJobStatusDto) {
    const job = await this.findById(id);
    const now = new Date();

    const data: Prisma.SeleniumJobUpdateInput = {
      status: dto.status,
    };
    if (dto.progressPercent !== undefined) data.progressPercent = dto.progressPercent;
    if (dto.currentStepOrder !== undefined) data.currentStepOrder = dto.currentStepOrder;
    if (dto.outputData) data.outputData = dto.outputData as Prisma.InputJsonValue;
    if (dto.failReason) data.failReason = dto.failReason;

    if (dto.status === JobStatus.RUNNING && !job.startedAt) data.startedAt = now;
    if (dto.status === JobStatus.COMPLETED) { data.completedAt = now; data.progressPercent = 100; }
    if (dto.status === JobStatus.FAILED) { data.failedAt = now; data.retryCount = { increment: 1 }; }

    // Decrement runner load on terminal states
    if (([JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED] as string[]).includes(dto.status) && job.runnerId) {
      await this.prisma.seleniumRunner.update({
        where: { id: job.runnerId },
        data: { activeSessions: { decrement: 1 } },
      });
    }

    const updated = await this.prisma.seleniumJob.update({ where: { id: job.id }, data });

    // On success, persist a citizen-facing Application tracking record
    if (dto.status === JobStatus.COMPLETED) {
      await this.persistApplication(job, dto.outputData).catch(() => undefined);
    }

    // Push real-time progress to the originating kiosk device
    const inputData = (job.inputData ?? {}) as Record<string, unknown>;
    const deviceSerial = inputData['deviceSerial'] as string | undefined;
    if (deviceSerial) {
      this.realtime.sendToDevice(deviceSerial, 'selenium:progress', {
        jobId: job.id,
        status: dto.status,
        progressPercent: dto.progressPercent ?? updated.progressPercent,
        currentStepOrder: dto.currentStepOrder ?? updated.currentStepOrder,
        citizenMessage: dto.citizenMessage,
        outputData: dto.status === JobStatus.COMPLETED ? dto.outputData : undefined,
        failReason: dto.failReason,
      });
    }
    // Also notify CMS
    this.realtime.emitToCms('selenium:job_updated', {
      jobId: job.id,
      status: dto.status,
      progressPercent: updated.progressPercent,
    });

    return updated;
  }

  /**
   * Persist an Application tracking row when a submission workflow succeeds.
   * Best-effort: requires a citizen + procedure; uses the extracted code as
   * the tracking code. Skipped silently if prerequisites are missing.
   */
  private async persistApplication(
    job: { id: string; citizenId: string | null; kioskSessionId: string | null; inputData: unknown },
    outputData?: Record<string, unknown>,
  ) {
    const input = (job.inputData ?? {}) as Record<string, unknown>;
    const procedureId = input['procedureId'] as string | undefined;
    const code = (outputData?.['applicationCode'] as string | undefined)?.trim();
    if (!job.citizenId || !job.kioskSessionId || !procedureId) return;

    const trackingCode = code && code.length > 0
      ? code
      : `KIOSK-${Date.now().toString(36).toUpperCase()}`;

    // Avoid duplicate tracking codes
    const existing = await this.prisma.application.findUnique({ where: { trackingCode } });
    if (existing) return;

    await this.prisma.application.create({
      data: {
        sessionId: job.kioskSessionId,
        citizenId: job.citizenId,
        procedureId,
        trackingCode,
        status: 'SUBMITTED',
        submittedAt: new Date(),
        formData: (outputData ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  /** Runner calls this when it needs citizen input (OTP, VNeID, CAPTCHA, confirm) */
  async requestCitizenInput(
    id: string,
    inputType: string,
    payload: Record<string, unknown> = {},
  ) {
    const job = await this.findById(id);
    const inputData = (job.inputData ?? {}) as Record<string, unknown>;
    const deviceSerial = inputData['deviceSerial'] as string | undefined;

    // Register that we're waiting
    citizenInputStore.set(job.id, 'waiting');

    if (deviceSerial) {
      this.realtime.sendToDevice(deviceSerial, 'selenium:needs_input', {
        jobId: job.id,
        inputType,
        payload,
      });
    }
    return { jobId: job.id, inputType, waiting: true };
  }

  /** Kiosk submits citizen input (OTP, confirmation, etc.) */
  async submitCitizenInput(id: string, dto: CitizenInputDto) {
    const job = await this.findById(id);
    citizenInputStore.set(job.id, dto);

    // Notify CMS and runner (runner polls via /poll-input)
    this.realtime.emitToCms('selenium:citizen_input', {
      jobId: job.id,
      inputType: dto.inputType,
    });

    return { jobId: job.id, received: true };
  }

  /** Runner polls this to pick up citizen input */
  async pollCitizenInput(id: string): Promise<CitizenInputDto | null> {
    const job = await this.findById(id);
    const entry = citizenInputStore.get(job.id);
    if (!entry || entry === 'waiting') return null;
    // Clear after pickup so runner only gets it once
    citizenInputStore.delete(job.id);
    return entry;
  }

  // ─── Interactive remote control (kiosk taps/keys → runner browser) ──────────

  /** Kiosk enqueues a tap/key/scroll event. Hot path — no DB hit. */
  enqueueInteraction(id: string, event: InteractionEvent) {
    const arr = interactionStore.get(id) ?? [];
    const last = arr[arr.length - 1];
    if (event.type === 'touchMove' && last?.type === 'touchMove') {
      arr[arr.length - 1] = event;
    } else if (event.type === 'scroll' && last?.type === 'scroll') {
      last.deltaX = (last.deltaX ?? 0) + (event.deltaX ?? 0);
      last.deltaY = (last.deltaY ?? 0) + (event.deltaY ?? 0);
    } else {
      arr.push(event);
    }
    if (arr.length > 64) arr.splice(0, arr.length - 64);
    interactionStore.set(id, arr);
    return { queued: arr.length };
  }

  /** Runner drains all pending interaction events (short-poll). */
  drainInteractions(id: string): InteractionEvent[] {
    const arr = interactionStore.get(id) ?? [];
    if (arr.length) interactionStore.set(id, []);
    return arr;
  }

  /** Runner reports whether the element focused after a tap is a text input,
   *  so the kiosk can auto-show / hide the on-screen keyboard. */
  reportInputFocus(id: string, focused: boolean) {
    const deviceSerial = jobDeviceCache.get(id);
    if (deviceSerial) {
      this.realtime.sendToDevice(deviceSerial, 'selenium:input_focus', { jobId: id, focused });
    }
    return { ok: true };
  }

  async cancel(id: string) {
    return this.updateStatus(id, { status: JobStatus.CANCELLED });
  }

  async retry(id: string) {
    const job = await this.findById(id);
    if (!([JobStatus.FAILED, JobStatus.CANCELLED] as string[]).includes(job.status)) {
      throw new Error('Only FAILED or CANCELLED jobs can be retried');
    }
    const runner = await this.runners.pickRunner();
    return this.prisma.seleniumJob.update({
      where: { id: job.id },
      data: {
        status: runner ? JobStatus.QUEUED : JobStatus.PENDING,
        runnerId: runner?.id ?? job.runnerId,
        failReason: null,
        progressPercent: 0,
        currentStepOrder: 0,
        startedAt: null,
        completedAt: null,
        failedAt: null,
        scheduledAt: new Date(),
      },
    });
  }

  async addLog(jobId: string, dto: AddJobLogDto) {
    return this.prisma.seleniumJobLog.create({
      data: {
        jobId,
        stepOrder: dto.stepOrder,
        stepName: dto.stepName,
        level: (dto.level as LogLevel) ?? LogLevel.INFO,
        message: dto.message,
        detail: dto.detail as Prisma.InputJsonValue | undefined,
        durationMs: dto.durationMs,
      },
    });
  }

  async addScreenshot(jobId: string, dto: AddScreenshotDto) {
    const shot = dto.isLive
      ? null
      : await this.prisma.seleniumScreenshot.create({
          data: {
            jobId,
            storagePath: dto.storagePath,
            bucketName: dto.bucketName,
            stepOrder: dto.stepOrder,
            stepName: dto.stepName,
            sizeBytes: dto.sizeBytes,
          },
        });

    // Push screenshot URL to originating kiosk device in real-time
    try {
      let deviceSerial = jobDeviceCache.get(jobId);
      if (!deviceSerial) {
        const job = await this.prisma.seleniumJob.findUnique({ where: { id: jobId }, select: { inputData: true } });
        const inputData = (job?.inputData ?? {}) as Record<string, unknown>;
        deviceSerial = inputData['deviceSerial'] as string | undefined;
        if (deviceSerial) jobDeviceCache.set(jobId, deviceSerial);
      }
      if (deviceSerial && dto.storagePath) {
        this.realtime.sendToDevice(deviceSerial, 'selenium:screenshot', {
          jobId,
          screenshotUrl: `/uploads/${dto.storagePath}`,
          stepOrder: dto.stepOrder,
          pageUrl: dto.pageUrl,
        });
      }
    } catch { /* non-critical */ }

    return shot ?? { jobId, storagePath: dto.storagePath, isLive: true };
  }

  async getJobLogs(jobId: string, limit = 500) {
    return this.prisma.seleniumJobLog.findMany({
      where: { jobId },
      orderBy: { createdAt: 'asc' },
      take: limit,
    });
  }

  async getScreenshots(jobId: string) {
    return this.prisma.seleniumScreenshot.findMany({
      where: { jobId },
      orderBy: { capturedAt: 'asc' },
    });
  }

  /** Pending jobs queue — for runner polling */
  async dequeueForRunner(runnerId: string, limit = 5) {
    return this.prisma.seleniumJob.findMany({
      where: { runnerId, status: JobStatus.QUEUED },
      orderBy: [{ priority: 'desc' }, { scheduledAt: 'asc' }],
      take: limit,
      include: {
        template: { include: { steps: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' } } } },
      },
    });
  }
}
