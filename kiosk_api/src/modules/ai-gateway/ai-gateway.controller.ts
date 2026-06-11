import {
  Controller, Get, Post, Patch, Delete, Param, Body,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiGatewayService } from './ai-gateway.service';
import { AiRunnerService } from './ai-runner.service';
import { AiHealthService } from './ai-health.service';
import { ChatDto, CreateAiRunnerDto, UpdateAiRunnerDto } from './ai-gateway.dto';

/* ─── Kiosk-facing entry point ─────────────────────────── */
@ApiTags('AI Gateway (kiosk)')
@Controller('ai')
export class AiGatewayController {
  constructor(private gateway: AiGatewayService) {}

  @Post('chat')
  @ApiOperation({ summary: 'Citizen chat → intent → procedure → action chips' })
  chat(@Body() dto: ChatDto) {
    return this.gateway.chat(dto);
  }

  @Post('action')
  @ApiOperation({ summary: 'Execute an action chip (OPEN_PROCEDURE → shared workflow launch)' })
  action(@Body() dto: {
    type: string; procedureId?: string;
    kioskSessionId: string; citizenId?: string; deviceSerial?: string;
  }) {
    return this.gateway.executeAction(dto);
  }
}

/* ─── CMS-facing AI Runner Registry ────────────────────── */
@ApiTags('AI Runner Registry (CMS)')
@Controller('ai-runners')
export class AiRunnerController {
  constructor(
    private runners: AiRunnerService,
    private health: AiHealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List configured AI providers (auth keys masked)' })
  findAll() { return this.runners.findAll(); }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.runners.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Add an AI provider (Ollama / Gemini / OpenAI-compatible / private)' })
  create(@Body() dto: CreateAiRunnerDto) { return this.runners.create(dto); }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateAiRunnerDto) {
    return this.runners.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) { return this.runners.remove(id); }

  @Post(':id/health-check')
  @ApiOperation({ summary: 'Run a liveness probe against this provider now' })
  check(@Param('id') id: string) { return this.health.checkOne(id); }

  @Get(':id/health-logs')
  logs(@Param('id') id: string) { return this.health.recentLogs(id); }
}
