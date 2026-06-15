import {
  Controller, Get, Post, Patch, Put, Delete, Param, Body, Headers, Query,
} from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AiGatewayService } from './ai-gateway.service';
import { AiRunnerService } from './ai-runner.service';
import { AiHealthService } from './ai-health.service';
import { ChatbotConfigService } from './chatbot-config.service';
import { ChatDto, CreateAiRunnerDto, UpdateAiRunnerDto, UpdateChatbotConfigDto } from './ai-gateway.dto';

function decodeName(raw?: string): string | undefined {
  if (!raw) return undefined;
  try { return decodeURIComponent(raw); } catch { return raw; }
}

/* ─── Kiosk-facing entry point ─────────────────────────── */
@ApiTags('AI Gateway (kiosk)')
@Controller('ai')
export class AiGatewayController {
  constructor(
    private gateway: AiGatewayService,
    private chatbotConfig: ChatbotConfigService,
  ) {}

  @Post('chat')
  @ApiOperation({ summary: 'Citizen chat → intent → procedure → action chips' })
  chat(@Body() dto: ChatDto) {
    return this.gateway.chat(dto);
  }

  @Post('action')
  @ApiOperation({ summary: 'Execute an action chip (START_WORKFLOW/OPEN_PROCEDURE → shared workflow launch)' })
  action(@Body() dto: {
    type: string; procedureId?: string;
    kioskSessionId: string; citizenId?: string; deviceSerial?: string;
  }) {
    return this.gateway.executeAction(dto);
  }

  @Get('reports')
  @ApiOperation({ summary: 'CMS: AI usage report (conversations, intents, providers, jobs)' })
  reports(@Query('days') days?: string) {
    return this.gateway.usageReport(days ? parseInt(days, 10) : 30);
  }

  /* ── Chatbot configuration (per-location; no locationId = global default) ── */
  @Get('locations')
  @ApiOperation({ summary: 'CMS: locations for the config dropdown' })
  listLocations() { return this.chatbotConfig.listLocations(); }

  @Get('config')
  @ApiOperation({ summary: 'CMS: full chatbot config for a location (or global)' })
  getConfig(@Query('locationId') locationId?: string) {
    return this.chatbotConfig.getForAdmin(locationId || null);
  }

  @Get('config/public')
  @ApiOperation({ summary: 'Kiosk: lightweight config resolved for its location' })
  getPublicConfig(@Query('locationId') locationId?: string) {
    return this.chatbotConfig.getPublic(locationId || null);
  }

  @Put('config')
  @ApiOperation({ summary: 'CMS: save the chatbot config for a location (or global)' })
  saveConfig(
    @Body() dto: UpdateChatbotConfigDto,
    @Query('locationId') locationId?: string,
    @Headers('x-actor-name') actorName?: string,
  ) {
    return this.chatbotConfig.update(dto, locationId || null, decodeName(actorName));
  }

  @Delete('config')
  @ApiOperation({ summary: 'CMS: remove a location override (revert to global)' })
  resetConfig(@Query('locationId') locationId: string) {
    return this.chatbotConfig.resetLocation(locationId);
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
