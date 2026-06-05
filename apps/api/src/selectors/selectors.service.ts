import { Injectable, NotFoundException } from "@nestjs/common";
import { SelectorType } from "@prisma/client";
import { PrismaService } from "../prisma.service";

const selectorTypeMap: Record<string, SelectorType> = {
  "data-testid": SelectorType.DATA_TESTID,
  "aria-label": SelectorType.ARIA_LABEL,
  text: SelectorType.TEXT,
  css: SelectorType.CSS,
  xpath: SelectorType.XPATH,
  image: SelectorType.IMAGE
};

@Injectable()
export class SelectorsService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.selector.findMany({
      orderBy: { createdAt: "desc" },
      include: { versions: { orderBy: { createdAt: "desc" } } }
    });
  }

  async upsert(input: {
    selectorKey: string;
    name?: string;
    description?: string;
    workflowId?: string;
  }) {
    return this.prisma.selector.upsert({
      where: { selectorKey: input.selectorKey },
      update: {
        name: input.name,
        description: input.description,
        workflowId: input.workflowId
      },
      create: {
        selectorKey: input.selectorKey,
        name: input.name,
        description: input.description,
        workflowId: input.workflowId
      }
    });
  }

  async addVersion(selectorKey: string, input: {
    version: string;
    selectorType: string;
    selectorValue: string;
    priority: number;
    isActive?: boolean;
  }) {
    const selector = await this.prisma.selector.findUnique({ where: { selectorKey } });
    if (!selector) {
      throw new NotFoundException("Selector not found");
    }

    return this.prisma.$transaction(async (tx) => {
      if (input.isActive) {
        await tx.selectorVersion.updateMany({
          where: { selectorId: selector.id },
          data: { isActive: false }
        });
        await tx.selector.update({
          where: { id: selector.id },
          data: {
            selectorType: selectorTypeMap[input.selectorType],
            selectorValue: input.selectorValue,
            priority: input.priority
          }
        });
      }

      return tx.selectorVersion.create({
        data: {
          selectorId: selector.id,
          version: input.version,
          selectorType: selectorTypeMap[input.selectorType],
          selectorValue: input.selectorValue,
          priority: input.priority,
          isActive: Boolean(input.isActive)
        }
      });
    });
  }
}
