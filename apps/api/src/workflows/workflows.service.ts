import { Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, WorkflowAction } from "@prisma/client";
import { PrismaService } from "../prisma.service";

type WorkflowInput = {
  slug: string;
  name: string;
  description?: string;
};

type WorkflowVersionInput = {
  version: string;
  definition: Record<string, unknown>;
  isActive?: boolean;
  signature?: string;
};

const actionMap: Record<string, WorkflowAction> = {
  open: WorkflowAction.OPEN,
  click: WorkflowAction.CLICK,
  input: WorkflowAction.INPUT,
  upload: WorkflowAction.UPLOAD,
  wait: WorkflowAction.WAIT,
  assert: WorkflowAction.ASSERT,
  screenshot: WorkflowAction.SCREENSHOT
};

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.workflow.findMany({
      orderBy: { updatedAt: "desc" },
      include: {
        versions: { take: 3, orderBy: { createdAt: "desc" } }
      }
    });
  }

  get(slug: string) {
    return this.prisma.workflow.findUnique({
      where: { slug },
      include: {
        versions: {
          orderBy: { createdAt: "desc" },
          include: { steps: { orderBy: { order: "asc" } } }
        },
        selectors: { include: { versions: { where: { isActive: true } } } }
      }
    });
  }

  async upsertWorkflow(input: WorkflowInput) {
    return this.prisma.workflow.upsert({
      where: { slug: input.slug },
      update: {
        name: input.name,
        description: input.description,
        updatedAt: new Date()
      },
      create: {
        slug: input.slug,
        name: input.name,
        description: input.description
      }
    });
  }

  async createVersion(slug: string, input: WorkflowVersionInput) {
    const workflow = await this.prisma.workflow.findUnique({ where: { slug } });
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.workflowVersion.updateMany({
          where: { workflowId: workflow.id },
          data: { isActive: false, status: "ARCHIVED" }
        });
      }

      const version = await tx.workflowVersion.create({
        data: {
          workflowId: workflow.id,
          version: input.version,
          definition: input.definition as Prisma.InputJsonValue,
          signature: input.signature,
          isActive: Boolean(input.isActive),
          status: input.isActive ? "ACTIVE" : "DRAFT"
        }
      });

      const definition = input.definition as {
        steps?: Array<{
          stepKey?: string;
          action?: string;
          url?: string;
          selectorId?: string;
          inputSource?: string;
          timeoutMs?: number;
          retryCount?: number;
        }>;
      };

      if (Array.isArray(definition.steps)) {
        await tx.workflowStep.createMany({
          data: definition.steps.map((step, index) => ({
            workflowVersionId: version.id,
            stepKey: step.stepKey ?? `step_${index + 1}`,
            order: index + 1,
            action: actionMap[String(step.action ?? "wait").toLowerCase()] ?? WorkflowAction.WAIT,
            targetUrl: step.url,
            selectorKey: step.selectorId,
            inputSource: step.inputSource,
            timeoutMs: step.timeoutMs ?? 30000,
            retryCount: step.retryCount ?? 3,
            metadata: step as Prisma.InputJsonValue
          }))
        });
      }

      if (input.isActive) {
        await tx.workflow.update({
          where: { id: workflow.id },
          data: { activeVersion: input.version, updatedAt: new Date() }
        });
      }

      return version;
    });
  }

  async active(slug: string) {
    const workflow = await this.prisma.workflow.findUnique({
      where: { slug },
      include: {
        versions: {
          where: { isActive: true },
          take: 1,
          include: { steps: { orderBy: { order: "asc" } } }
        }
      }
    });

    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }

    return workflow;
  }
}
