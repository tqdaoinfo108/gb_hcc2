import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CreateWorkflowTemplateDto, UpdateWorkflowTemplateDto, CreateWorkflowStepDto, UpdateWorkflowStepDto } from './selenium.dto';

@Injectable()
export class WorkflowTemplateService {
  constructor(private prisma: PrismaService) {}

  async findAll(includeInactive = false) {
    return this.prisma.workflowTemplate.findMany({
      where: { deletedAt: null, ...(includeInactive ? {} : { isActive: true }) },
      include: {
        _count: { select: { steps: { where: { deletedAt: null } }, jobs: true } },
      },
      orderBy: [{ isPublished: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async findById(id: string) {
    const tpl = await this.prisma.workflowTemplate.findFirst({
      where: { deletedAt: null, OR: [{ id }, { code: id }] },
      include: {
        steps: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' } },
        _count: { select: { jobs: true } },
      },
    });
    if (!tpl) throw new NotFoundException('Workflow template not found');
    return tpl;
  }

  async create(dto: CreateWorkflowTemplateDto) {
    const exists = await this.prisma.workflowTemplate.findFirst({
      where: { code: dto.code.trim().toUpperCase(), deletedAt: null },
    });
    if (exists) throw new ConflictException(`Template code "${dto.code}" already exists`);
    return this.prisma.workflowTemplate.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        name: dto.name.trim(),
        description: dto.description?.trim(),
        targetUrl: dto.targetUrl.trim(),
        portalCode: dto.portalCode?.trim().toUpperCase(),
        procedureId: dto.procedureId,
        authMethod: dto.authMethod,
        screenshotMode: dto.screenshotMode,
        timeoutSeconds: dto.timeoutSeconds ?? 120,
        maxRetries: dto.maxRetries ?? 2,
        configJson: (dto.configJson ?? {}) as any,
      },
      include: { steps: true },
    });
  }

  async update(id: string, dto: UpdateWorkflowTemplateDto) {
    const tpl = await this.findById(id);
    return this.prisma.workflowTemplate.update({
      where: { id: tpl.id },
      data: {
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        targetUrl: dto.targetUrl?.trim(),
        portalCode: dto.portalCode?.trim().toUpperCase(),
        procedureId: dto.procedureId,
        authMethod: dto.authMethod,
        screenshotMode: dto.screenshotMode,
        timeoutSeconds: dto.timeoutSeconds,
        maxRetries: dto.maxRetries,
        configJson: dto.configJson as any,
        isActive: dto.isActive,
        isPublished: dto.isPublished,
        publishedAt: dto.isPublished ? new Date() : undefined,
        version: { increment: 1 },
      },
      include: { steps: { where: { deletedAt: null }, orderBy: { stepOrder: 'asc' } } },
    });
  }

  async remove(id: string) {
    const tpl = await this.findById(id);
    await this.prisma.workflowTemplate.update({
      where: { id: tpl.id },
      data: { deletedAt: new Date(), isActive: false, isPublished: false },
    });
    return { deleted: true };
  }

  // ─── Steps ──────────────────────────────────────────────────────────────────

  async addStep(templateId: string, dto: CreateWorkflowStepDto) {
    const tpl = await this.findById(templateId);
    // Shift existing steps if needed
    await this.prisma.workflowStep.updateMany({
      where: { templateId: tpl.id, stepOrder: { gte: dto.stepOrder }, deletedAt: null },
      data: { stepOrder: { increment: 1 } },
    });
    return this.prisma.workflowStep.create({
      data: {
        templateId: tpl.id,
        stepOrder: dto.stepOrder,
        stepType: dto.stepType,
        name: dto.name.trim(),
        description: dto.description?.trim(),
        isRequired: dto.isRequired ?? true,
        url: dto.url?.trim(),
        waitFor: dto.waitFor?.trim(),
        waitTimeoutMs: dto.waitTimeoutMs ?? 10000,
        selector: dto.selector?.trim(),
        selectorAlt: dto.selectorAlt?.trim(),
        selectorType: dto.selectorType,
        action: dto.action,
        inputValue: dto.inputValue,
        inputMapping: dto.inputMapping as any,
        uploadField: dto.uploadField,
        assertText: dto.assertText,
        assertUrl: dto.assertUrl,
        assertVisible: dto.assertVisible,
        onFailure: dto.onFailure,
        retryCount: dto.retryCount ?? 1,
        delayAfterMs: dto.delayAfterMs ?? 500,
        conditionExpr: dto.conditionExpr,
      },
    });
  }

  async updateStep(stepId: string, dto: UpdateWorkflowStepDto) {
    const step = await this.prisma.workflowStep.findFirst({
      where: { id: stepId, deletedAt: null },
    });
    if (!step) throw new NotFoundException('Workflow step not found');
    return this.prisma.workflowStep.update({
      where: { id: step.id },
      data: {
        stepOrder: dto.stepOrder,
        stepType: dto.stepType,
        name: dto.name?.trim(),
        description: dto.description?.trim(),
        isRequired: dto.isRequired,
        url: dto.url?.trim(),
        waitFor: dto.waitFor?.trim(),
        waitTimeoutMs: dto.waitTimeoutMs,
        selector: dto.selector?.trim(),
        selectorAlt: dto.selectorAlt?.trim(),
        selectorType: dto.selectorType,
        action: dto.action,
        inputValue: dto.inputValue,
        inputMapping: dto.inputMapping as any,
        uploadField: dto.uploadField,
        assertText: dto.assertText,
        assertUrl: dto.assertUrl,
        assertVisible: dto.assertVisible,
        onFailure: dto.onFailure,
        retryCount: dto.retryCount,
        delayAfterMs: dto.delayAfterMs,
        conditionExpr: dto.conditionExpr,
      },
    });
  }

  async removeStep(stepId: string) {
    const step = await this.prisma.workflowStep.findFirst({
      where: { id: stepId, deletedAt: null },
    });
    if (!step) throw new NotFoundException('Workflow step not found');
    await this.prisma.workflowStep.update({
      where: { id: step.id },
      data: { deletedAt: new Date() },
    });
    // Compact step orders
    await this.reorderSteps(step.templateId);
    return { deleted: true };
  }

  async reorderSteps(templateId: string) {
    const steps = await this.prisma.workflowStep.findMany({
      where: { templateId, deletedAt: null },
      orderBy: { stepOrder: 'asc' },
    });
    for (let i = 0; i < steps.length; i++) {
      if (steps[i].stepOrder !== i + 1) {
        await this.prisma.workflowStep.update({
          where: { id: steps[i].id },
          data: { stepOrder: i + 1 },
        });
      }
    }
  }
}
