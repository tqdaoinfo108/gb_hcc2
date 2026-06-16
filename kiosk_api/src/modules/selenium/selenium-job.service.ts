import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, LogLevel, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { SeleniumRunnerService } from './selenium-runner.service';
import { DispatchJobDto, UpdateJobStatusDto, AddJobLogDto, AddScreenshotDto } from './selenium.dto';

// Live frames, interactive control, citizen-input and the recorder action relay
// all moved to the WebRTC DataChannel (localhost) between each kiosk/CMS and its
// local automation host. The API now only owns job STATE + persistence.

/** Cache deviceSerial per job (set at dispatch; used for screenshot routing). */
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

  /** Submitted applications on a given kiosk (by device serial) — newest first. */
  async getSubmissionsByDevice(deviceSerial: string, limit = 50) {
    return this.prisma.seleniumJob.findMany({
      where: { submittedDeviceSerial: deviceSerial, status: JobStatus.COMPLETED, applicationCode: { not: null } },
      select: {
        id: true, applicationCode: true, completedAt: true,
        template: { select: { name: true, targetUrl: true } },
      },
      orderBy: { completedAt: 'desc' },
      take: limit,
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
    if (dto.status === JobStatus.COMPLETED) {
      data.completedAt = now;
      data.progressPercent = 100;
      // Persist the submitted application code + kiosk for fast per-device lookup
      const code = (dto.outputData?.['applicationCode'] as string | undefined)?.trim();
      if (code) data.applicationCode = code;
      const input = (job.inputData ?? {}) as Record<string, unknown>;
      const serial = input['deviceSerial'] as string | undefined;
      if (serial) data.submittedDeviceSerial = serial;
    }
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

    // Push real-time progress. Primary route is by jobId (always present on
    // both sides); deviceSerial is kept as a best-effort secondary route.
    const inputData = (job.inputData ?? {}) as Record<string, unknown>;
    const deviceSerial = inputData['deviceSerial'] as string | undefined;
    const progressPayload = {
      jobId: job.id,
      status: dto.status,
      progressPercent: dto.progressPercent ?? updated.progressPercent,
      currentStepOrder: dto.currentStepOrder ?? updated.currentStepOrder,
      citizenMessage: dto.citizenMessage,
      outputData: dto.status === JobStatus.COMPLETED ? dto.outputData : undefined,
      failReason: dto.failReason,
    };
    this.realtime.sendToJob(job.id, 'selenium:progress', progressPayload);
    if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:progress', progressPayload);
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

  /** Replace ALL steps of a template with the provided ordered list (recorder save). */
  async replaceSteps(templateId: string, steps: Array<Record<string, unknown>>) {
    const tpl = await this.prisma.workflowTemplate.findFirst({ where: { deletedAt: null, OR: [{ id: templateId }, { code: templateId }] } });
    if (!tpl) throw new NotFoundException('Workflow template not found');
    await this.prisma.workflowStep.deleteMany({ where: { templateId: tpl.id } });
    if (steps.length) {
      await this.prisma.workflowStep.createMany({
        data: steps.map((s, i) => ({
          templateId: tpl.id,
          stepOrder: i + 1,
          stepType: (s.stepType as any) ?? 'CLICK',
          name: (s.name as string)?.slice(0, 200) || `Bước ${i + 1}`,
          url: (s.url as string) || null,
          selector: (s.selector as string) || null,
          selectorType: (s.selectorType as any) || 'CSS',
          inputValue: (s.inputValue as string) || null,
          waitFor: (s.waitFor as string) || null,
          assertText: (s.assertText as string) || null,
          uploadField: (s.uploadField as string) || null,
          onFailure: (s.onFailure as any) || 'STOP',
          isRequired: s.isRequired === undefined ? true : !!s.isRequired,
          delayAfterMs: typeof s.delayAfterMs === 'number' ? (s.delayAfterMs as number) : 500,
        })),
      });
    }
    return this.prisma.workflowStep.findMany({ where: { templateId: tpl.id, deletedAt: null }, orderBy: { stepOrder: 'asc' } });
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
      if (dto.storagePath) {
        const payload = {
          jobId,
          screenshotUrl: `/uploads/${dto.storagePath}`,
          stepOrder: dto.stepOrder,
          pageUrl: dto.pageUrl,
        };
        // Deliver persisted step screenshots by jobId (+ deviceSerial fallback).
        this.realtime.sendToJob(jobId, 'selenium:screenshot', payload);
        if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:screenshot', payload);
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
