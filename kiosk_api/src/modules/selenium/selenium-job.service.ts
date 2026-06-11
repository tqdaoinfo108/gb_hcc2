import { Injectable, NotFoundException } from '@nestjs/common';
import { JobStatus, LogLevel, Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { PrismaService } from '../../prisma.service';
import { RealtimeService } from '../../realtime/realtime.service';
import { SeleniumRunnerService } from './selenium-runner.service';
import { CitizenInputDto, DispatchJobDto, UpdateJobStatusDto, AddJobLogDto, AddScreenshotDto, LiveFrameDto } from './selenium.dto';

/** In-memory store for pending citizen input per jobId */
const citizenInputStore = new Map<string, CitizenInputDto | 'waiting'>();

/** Interaction events (taps/keys/scroll/fill) queued from kiosk/CMS → drained by runner */
export interface InteractionEvent {
  type: 'click' | 'touchStart' | 'touchMove' | 'touchEnd' | 'type' | 'key' | 'scroll' | 'fill' | 'finish';
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  deltaX?: number;
  deltaY?: number;
  selector?: string;
  selectorType?: string;
}
const interactionStore = new Map<string, InteractionEvent[]>();
/** Cache deviceSerial per job to avoid a DB hit on every focus report */
const jobDeviceCache = new Map<string, string>();

/** Upload bridge: token → which job is waiting for a file (phone QR / kiosk capture) */
interface UploadSession { jobId: string; createdAt: number; uploadField?: string; fileUrl?: string }
const uploadSessions = new Map<string, UploadSession>();

/** Recorder: captured actions per record-job, surfaced live to the CMS builder */
export interface RecordedAction {
  kind: 'open' | 'click' | 'fill' | 'url';
  selector?: string;
  selectorType?: string;
  tag?: string;
  inputType?: string;
  isInput?: boolean;
  isSelect?: boolean;
  isCheckable?: boolean;
  text?: string;
  name?: string;
  elId?: string;
  ariaLabel?: string;
  label?: string;
  placeholder?: string;
  href?: string;
  url?: string;
  value?: string;
  at?: number;
}
const recordingStore = new Map<string, RecordedAction[]>();

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

    const needsInputPayload = { jobId: job.id, inputType, payload };
    this.realtime.sendToJob(job.id, 'selenium:needs_input', needsInputPayload);
    if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:needs_input', needsInputPayload);
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
    const payload = { jobId: id, focused };
    this.realtime.sendToJob(id, 'selenium:input_focus', payload);
    const deviceSerial = jobDeviceCache.get(id);
    if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:input_focus', payload);
    return { ok: true };
  }

  // ─── Recorder (admin "inspect to record" template builder) ──────────────────

  /** Start a record session: dispatch a job that opens the URL in record mode. */
  async startRecording(input: { templateId?: string; url: string }) {
    let templateId = input.templateId;
    // Record jobs need a template FK; if none given, pick any template as a host.
    if (!templateId) {
      const anyTpl = await this.prisma.workflowTemplate.findFirst({ where: { deletedAt: null }, select: { id: true } });
      if (!anyTpl) throw new NotFoundException('Chưa có quy trình nào để ghi. Hãy tạo quy trình trước.');
      templateId = anyTpl.id;
    }
    const job = await this.dispatch({
      templateId,
      priority: 9,
      inputData: { recordMode: true, recordUrl: input.url } as Record<string, unknown>,
    } as DispatchJobDto);
    recordingStore.set(job.id, []);
    return { jobId: job.id, status: job.status, runnerAssigned: !!job.runnerId, url: input.url };
  }

  /** Runner reports one captured action; buffer it and push to the CMS live. */
  recordAction(id: string, action: RecordedAction) {
    if (action.kind === 'url') {
      // URL change — just inform the CMS for the address bar, don't buffer
      this.realtime.emitToCms('selenium:record_url', { jobId: id, url: action.url });
      return { ok: true };
    }
    const arr = recordingStore.get(id) ?? [];
    const stamped = { ...action, at: Date.now() };
    arr.push(stamped);
    recordingStore.set(id, arr);
    this.realtime.emitToCms('selenium:recorded', { jobId: id, action: stamped, index: arr.length - 1 });
    return { ok: true, count: arr.length };
  }

  getRecording(id: string): RecordedAction[] {
    return recordingStore.get(id) ?? [];
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

  // ─── File upload bridge (kiosk scan / phone QR → runner setInputFiles) ──────

  /** Create a one-time upload session for a job. Returns a short token used by
   *  the phone QR page and the kiosk camera capture to POST a file. */
  createUploadSession(jobId: string, uploadField?: string) {
    const token = crypto.randomBytes(10).toString('hex');
    uploadSessions.set(token, { jobId, createdAt: Date.now(), uploadField });
    return { token, jobId };
  }

  getUploadSession(token: string): UploadSession | null {
    return uploadSessions.get(token) ?? null;
  }

  /** Receive a file (from phone or kiosk), persist it, and hand it to the runner
   *  via the citizen-input channel so it can call setInputFiles(). */
  async receiveUpload(token: string, buffer: Buffer, originalName: string) {
    const sess = uploadSessions.get(token);
    if (!sess) throw new NotFoundException('Phiên tải tệp không tồn tại hoặc đã hết hạn.');

    const dir = path.join(process.cwd(), 'uploads', 'selenium-uploads');
    fs.mkdirSync(dir, { recursive: true });
    const safe = (originalName || 'file').replace(/[^\w.\-]/g, '_').slice(-60);
    const fname = `${token}_${Date.now()}_${safe}`;
    fs.writeFileSync(path.join(dir, fname), buffer);
    const fileUrl = `/uploads/selenium-uploads/${fname}`;
    sess.fileUrl = fileUrl;

    // Hand the file to the runner (it polls citizen-input)
    await this.submitCitizenInput(sess.jobId, { inputType: 'UPLOAD', value: fileUrl, payload: { fileUrl } });

    // Tell the kiosk the file arrived so it can close the upload overlay
    const uploadPayload = { jobId: sess.jobId, fileUrl };
    this.realtime.sendToJob(sess.jobId, 'selenium:upload_received', uploadPayload);
    const deviceSerial = jobDeviceCache.get(sess.jobId);
    if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:upload_received', uploadPayload);
    return { ok: true, fileUrl };
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
        // Primary: deliver by jobId (kiosk subscribes to the job it launched).
        this.realtime.sendToJob(jobId, 'selenium:screenshot', payload);
        // Secondary best-effort route by deviceSerial (back-compat).
        if (deviceSerial) this.realtime.sendToDevice(deviceSerial, 'selenium:screenshot', payload);
        // Record sessions have no kiosk device — mirror frames to the CMS builder
        if (recordingStore.has(jobId)) this.realtime.emitToCms('selenium:screenshot', payload);
      }
    } catch { /* non-critical */ }

    return shot ?? { jobId, storagePath: dto.storagePath, isLive: true };
  }

  /**
   * Relay a live frame to the kiosk (by jobId) and, for record sessions, to the
   * CMS. The JPEG is sent as BINARY over the WebSocket (socket.io extracts the
   * Buffer as an attachment), so the client never makes a second HTTP GET.
   */
  pushLiveFrame(jobId: string, dto: LiveFrameDto) {
    let data: Buffer;
    try { data = Buffer.from(dto.b64, 'base64'); } catch { return { ok: false }; }
    const payload = { jobId, data, pageUrl: dto.pageUrl, stepOrder: dto.stepOrder };
    this.realtime.sendToJob(jobId, 'selenium:frame', payload);
    if (recordingStore.has(jobId)) this.realtime.emitToCms('selenium:frame', payload);
    return { ok: true, bytes: data.length };
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
