import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { SeleniumJobService } from '../selenium/selenium-job.service';

export type LaunchSource = 'MANUAL' | 'AI' | 'VOICE';

export interface LaunchInput {
  kioskSessionId: string;
  procedureId: string;
  citizenId?: string;
  deviceSerial?: string;
  source: LaunchSource;
  /** Optional pre-filled form data forwarded to the workflow. */
  formData?: Record<string, unknown>;
}

/**
 * THE CONVERGENCE POINT.
 *
 * Both citizen entry flows — the Manual "Nộp hồ sơ" flow and the AI Chat
 * "Nộp hồ sơ ngay" action chip — call launch() with a procedure_id. There is
 * exactly one path from a procedure to a running workflow, so submission logic
 * is never duplicated. launch() resolves the procedure's CMS-configured
 * WorkflowTemplate and hands it to the shared Selenium execution pipeline.
 */
@Injectable()
export class WorkflowLaunchService {
  constructor(
    private prisma: PrismaService,
    private jobs: SeleniumJobService,
  ) {}

  /** Find the published, active workflow template configured for a procedure. */
  private async resolveTemplate(procedureId: string) {
    return this.prisma.workflowTemplate.findFirst({
      where: { procedureId, isActive: true, isPublished: true, deletedAt: null },
      orderBy: { version: 'desc' },
      include: {
        _count: { select: { steps: true } },
        steps: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' }, select: { id: true } },
      },
    });
  }

  /**
   * Preview readiness for a procedure — used by the kiosk to decide whether to
   * show "Nộp hồ sơ ngay" or a "chưa hỗ trợ nộp trực tuyến" message.
   */
  async resolve(procedureId: string) {
    const procedure = await this.prisma.procedure.findFirst({
      where: { id: procedureId, deletedAt: null, isActive: true },
      include: {
        category: true,
        requirements: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!procedure) throw new NotFoundException('Không tìm thấy thủ tục.');

    const template = await this.resolveTemplate(procedureId);
    return {
      procedure: {
        id: procedure.id,
        code: procedure.code,
        name: procedure.name,
        agency: procedure.processingAgency,
        slaWorkDays: procedure.slaWorkDays,
        fee: procedure.fee ? Number(procedure.fee) : 0,
        feeNote: procedure.feeNote,
        category: procedure.category?.name ?? null,
        requirements: procedure.requirements.map(r => ({
          name: r.documentName, required: r.isRequired, formats: r.acceptedFormats,
        })),
      },
      online: !!template,
      workflow: template
        ? { id: template.id, code: template.code, name: template.name, targetUrl: template.targetUrl, stepCount: template._count.steps }
        : null,
    };
  }

  /** Launch the workflow for a procedure via the shared Selenium pipeline. */
  async launch(input: LaunchInput) {
    const template = await this.resolveTemplate(input.procedureId);
    if (!template) {
      throw new BadRequestException(
        'Thủ tục này hiện chưa hỗ trợ nộp hồ sơ trực tuyến tại kiosk. Vui lòng liên hệ quầy hướng dẫn.',
      );
    }
    if (template.steps.length === 0) {
      throw new BadRequestException('Quy trình nộp hồ sơ chưa được cấu hình đầy đủ.');
    }

    // Optional citizen profile snapshot for field mapping
    let citizenProfile: Record<string, unknown> | undefined;
    if (input.citizenId) {
      const c = await this.prisma.citizen.findFirst({ where: { id: input.citizenId, deletedAt: null } });
      if (c) {
        citizenProfile = {
          fullName: c.fullName, nationalId: c.nationalId,
          dateOfBirth: c.dateOfBirth ? c.dateOfBirth.toISOString().slice(0, 10) : undefined,
          gender: c.gender, phone: c.phone, email: c.email,
          address: c.address, province: c.province, district: c.district, ward: c.ward,
          vneidId: c.vneidId,
        };
      }
    }

    const job = await this.jobs.dispatch({
      templateId: template.id,
      kioskSessionId: input.kioskSessionId,
      citizenId: input.citizenId,
      deviceSerial: input.deviceSerial,
      priority: input.source === 'MANUAL' ? 6 : 5,
      inputData: {
        source: input.source,
        procedureId: input.procedureId,
        procedureCode: template.procedureId,
        citizenProfile,
        formData: input.formData ?? {},
      },
    } as any);

    return {
      jobId: job.id,
      status: job.status,
      runnerAssigned: !!job.runnerId,
      workflow: { id: template.id, name: template.name, stepCount: template.steps.length },
      message: 'Đang khởi tạo quy trình nộp hồ sơ…',
    };
  }
}
