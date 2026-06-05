import { Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString } from "class-validator";
import { AiService } from "./ai.service";

class AiConversationDto {
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  userQuestion!: string;

  @IsOptional()
  @IsObject()
  workflowState?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  automationError?: Record<string, unknown>;

  @IsString()
  assistantInstruction!: string;

  @IsOptional()
  @IsString()
  nextAction?: string;
}

@ApiTags("ai")
@Controller("ai")
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get("conversations")
  list() {
    return this.ai.list();
  }

  @Post("conversations")
  create(@Body() dto: AiConversationDto) {
    return this.ai.create(dto);
  }
}
