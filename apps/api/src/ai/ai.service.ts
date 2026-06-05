import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.aiConversation.findMany({
      orderBy: { createdAt: "desc" },
      include: { session: { include: { device: true } } }
    });
  }

  create(input: {
    sessionId?: string;
    userQuestion: string;
    workflowState?: Record<string, unknown>;
    automationError?: Record<string, unknown>;
    assistantInstruction: string;
    nextAction?: string;
  }) {
    return this.prisma.aiConversation.create({
      data: {
        sessionId: input.sessionId,
        userQuestion: input.userQuestion,
        workflowState: input.workflowState as Prisma.InputJsonValue | undefined,
        automationError: input.automationError as Prisma.InputJsonValue | undefined,
        assistantInstruction: input.assistantInstruction,
        nextAction: input.nextAction
      } as Prisma.AiConversationUncheckedCreateInput
    });
  }
}
