import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ApiTags } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";
import { PrismaService } from "../prisma.service";

class AutomationLogDto {
  @IsString()
  sessionId!: string;

  @IsOptional()
  @IsString()
  stepKey?: string;

  @IsString()
  level!: "INFO" | "WARN" | "ERROR";

  @IsString()
  message!: string;

  @IsOptional()
  @IsObject()
  evidence?: {
    durationMs?: number;
    screenshotUrl?: string;
    videoUrl?: string;
    domSnapshotUrl?: string;
    htmlSnapshot?: string;
    consoleLog?: Record<string, unknown>;
  };
}

@ApiTags("automation")
@Controller("automation")
export class AutomationController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("sessions")
  sessions() {
    return this.prisma.automationSession.findMany({
      orderBy: { startedAt: "desc" },
      include: { device: true, workflowVersion: { include: { workflow: true } } }
    });
  }

  @Get("sessions/:sessionId/logs")
  logs(@Param("sessionId") sessionId: string) {
    return this.prisma.automationLog.findMany({
      where: { sessionId },
      orderBy: { createdAt: "desc" }
    });
  }

  @Post("logs")
  createLog(@Body() dto: AutomationLogDto) {
    return this.prisma.automationLog.create({
      data: {
        sessionId: dto.sessionId,
        stepKey: dto.stepKey,
        level: dto.level,
        message: dto.message,
        durationMs: dto.evidence?.durationMs,
        screenshotUrl: dto.evidence?.screenshotUrl,
        videoUrl: dto.evidence?.videoUrl,
        domSnapshotUrl: dto.evidence?.domSnapshotUrl,
        htmlSnapshot: dto.evidence?.htmlSnapshot,
        consoleLog: dto.evidence?.consoleLog as Prisma.InputJsonValue | undefined
      }
    });
  }
}
