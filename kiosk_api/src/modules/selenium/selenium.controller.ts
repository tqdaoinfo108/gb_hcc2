import {
  Controller, Get, Post, Patch, Put, Delete, Param, Body, Query, HttpCode, Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { WorkflowTemplateService } from './workflow-template.service';
import { SeleniumRunnerService } from './selenium-runner.service';
import { SeleniumJobService } from './selenium-job.service';
import {
  CreateWorkflowTemplateDto, UpdateWorkflowTemplateDto,
  CreateWorkflowStepDto, UpdateWorkflowStepDto,
  RegisterRunnerDto, RunnerHeartbeatDto,
  DispatchJobDto, UpdateJobStatusDto, AddJobLogDto, AddScreenshotDto,
  CitizenInputDto, RequestInputDto, InteractEventDto, ReportFocusDto,
  StartRecordingDto, RecordActionDto, ReplaceStepsDto, LiveFrameDto,
} from './selenium.dto';

// ─── Workflow Templates ───────────────────────────────────────────────────────

@ApiTags('selenium / workflow-templates')
@Controller('selenium/templates')
export class WorkflowTemplateController {
  constructor(
    private templates: WorkflowTemplateService,
    private jobs: SeleniumJobService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List all workflow templates' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(@Query('includeInactive') inc?: string) {
    return this.templates.findAll(inc === 'true');
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get workflow template with steps' })
  findOne(@Param('id') id: string) { return this.templates.findById(id); }

  @Post()
  @ApiOperation({ summary: 'Create workflow template' })
  create(@Body() body: CreateWorkflowTemplateDto) { return this.templates.create(body); }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workflow template' })
  update(@Param('id') id: string, @Body() body: UpdateWorkflowTemplateDto) {
    return this.templates.update(id, body);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete workflow template' })
  remove(@Param('id') id: string) { return this.templates.remove(id); }

  // ─── Steps ─────────────────────────────────────────────────────────────────

  @Post(':id/steps')
  @ApiOperation({ summary: 'Add step to template' })
  addStep(@Param('id') id: string, @Body() body: CreateWorkflowStepDto) {
    return this.templates.addStep(id, body);
  }

  @Patch(':id/steps/:stepId')
  @ApiOperation({ summary: 'Update a template step' })
  updateStep(@Param('stepId') stepId: string, @Body() body: UpdateWorkflowStepDto) {
    return this.templates.updateStep(stepId, body);
  }

  @Delete(':id/steps/:stepId')
  @ApiOperation({ summary: 'Delete a template step' })
  removeStep(@Param('stepId') stepId: string) {
    return this.templates.removeStep(stepId);
  }

  // ─── Recorder ──────────────────────────────────────────────────────────────

  @Post(':id/record')
  @ApiOperation({ summary: 'Start a record session for this template (opens its target URL)' })
  async record(@Param('id') id: string, @Body() body: StartRecordingDto) {
    const tpl = await this.templates.findById(id);
    return this.jobs.startRecording({ templateId: tpl.id, url: body.url || tpl.targetUrl });
  }

  @Put(':id/steps')
  @ApiOperation({ summary: 'Replace ALL steps of a template (recorder save)' })
  replaceSteps(@Param('id') id: string, @Body() body: ReplaceStepsDto) {
    return this.jobs.replaceSteps(id, body.steps);
  }
}

// ─── Runners ──────────────────────────────────────────────────────────────────

@ApiTags('selenium / runners')
@Controller('selenium/runners')
export class SeleniumRunnerController {
  constructor(private runners: SeleniumRunnerService) {}

  @Get()
  @ApiOperation({ summary: 'List all Selenium runners' })
  findAll() { return this.runners.findAll(); }

  @Get(':runnerId')
  @ApiOperation({ summary: 'Get runner by ID' })
  findOne(@Param('runnerId') id: string) { return this.runners.findById(id); }

  @Post('register')
  @ApiOperation({ summary: 'Runner self-registration' })
  register(@Body() body: RegisterRunnerDto) { return this.runners.register(body); }

  @Post(':runnerId/heartbeat')
  @ApiOperation({ summary: 'Runner heartbeat / capacity update' })
  heartbeat(@Param('runnerId') id: string, @Body() body: RunnerHeartbeatDto) {
    return this.runners.heartbeat(id, body);
  }

  @Post(':runnerId/drain')
  @ApiOperation({ summary: 'Set runner to DRAINING state' })
  drain(@Param('runnerId') id: string) { return this.runners.drain(id); }

  @Delete(':runnerId')
  @ApiOperation({ summary: 'Remove runner registration' })
  remove(@Param('runnerId') id: string) { return this.runners.remove(id); }

  @Post('mark-stale')
  @ApiOperation({ summary: 'Mark timed-out runners as OFFLINE (cron trigger)' })
  markStale() { return this.runners.markOfflineStaleRunners(); }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

@ApiTags('selenium / jobs')
@Controller('selenium/jobs')
export class SeleniumJobController {
  constructor(private jobs: SeleniumJobService) {}

  @Get()
  @ApiOperation({ summary: 'List jobs with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'runnerId', required: false })
  @ApiQuery({ name: 'kioskSessionId', required: false })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: any,
    @Query('runnerId') runnerId?: string,
    @Query('kioskSessionId') kioskSessionId?: string,
    @Query('limit') limit?: string,
  ) {
    return this.jobs.findAll({ status, runnerId, kioskSessionId, limit: limit ? +limit : undefined });
  }

  @Get('submissions/:deviceSerial')
  @ApiOperation({ summary: 'List submitted application codes on a kiosk device' })
  submissions(@Param('deviceSerial') deviceSerial: string, @Query('limit') limit?: string) {
    return this.jobs.getSubmissionsByDevice(deviceSerial, limit ? +limit : 50);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get job details with logs and screenshots' })
  findOne(@Param('id') id: string) { return this.jobs.findById(id); }

  @Post('dispatch')
  @ApiOperation({ summary: 'Dispatch a new automation job' })
  dispatch(@Body() body: DispatchJobDto) { return this.jobs.dispatch(body); }

  @Patch(':id/status')
  @ApiOperation({ summary: 'Update job execution status (called by runner)' })
  updateStatus(@Param('id') id: string, @Body() body: UpdateJobStatusDto) {
    return this.jobs.updateStatus(id, body);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel a queued or running job' })
  cancel(@Param('id') id: string) { return this.jobs.cancel(id); }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed or cancelled job' })
  retry(@Param('id') id: string) { return this.jobs.retry(id); }

  @Post(':id/logs')
  @ApiOperation({ summary: 'Add execution log entry (called by runner)' })
  addLog(@Param('id') id: string, @Body() body: AddJobLogDto) {
    return this.jobs.addLog(id, body);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Get all logs for a job' })
  getLogs(@Param('id') id: string, @Query('limit') limit?: string) {
    return this.jobs.getJobLogs(id, limit ? +limit : 500);
  }

  @Post(':id/screenshots')
  @ApiOperation({ summary: 'Upload screenshot reference for a job (called by runner)' })
  addScreenshot(@Param('id') id: string, @Body() body: AddScreenshotDto) {
    return this.jobs.addScreenshot(id, body);
  }

  @Post(':id/frame')
  @HttpCode(200)
  @ApiOperation({ summary: 'Runner: push a live JPEG frame, relayed as binary over WS' })
  frame(@Param('id') id: string, @Body() body: LiveFrameDto) {
    return this.jobs.pushLiveFrame(id, body);
  }

  @Get(':id/live.jpg')
  @ApiOperation({ summary: 'Latest in-memory live frame for a job (image/jpeg)' })
  liveFrame(@Param('id') id: string, @Res() res: Response) {
    const buf = this.jobs.getLiveFrame(id);
    if (!buf) { res.status(204).end(); return; }
    res.set({
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      'Content-Length': String(buf.length),
    });
    res.end(buf);
  }

  @Get(':id/screenshots')
  @ApiOperation({ summary: 'Get screenshots for a job' })
  getScreenshots(@Param('id') id: string) { return this.jobs.getScreenshots(id); }

  @Get('queue/:runnerId')
  @ApiOperation({ summary: 'Dequeue pending jobs for a runner (runner polling)' })
  dequeue(@Param('runnerId') runnerId: string, @Query('limit') limit?: string) {
    return this.jobs.dequeueForRunner(runnerId, limit ? +limit : 5);
  }

  // ─── Citizen Interaction ──────────────────────────────────────────────────

  @Post(':id/request-input')
  @ApiOperation({ summary: 'Runner: pause job and request citizen interaction (OTP/VNeID/CAPTCHA/Confirm)' })
  requestInput(@Param('id') id: string, @Body() body: RequestInputDto) {
    return this.jobs.requestCitizenInput(id, body.inputType, body.payload);
  }

  @Post(':id/citizen-input')
  @HttpCode(200)
  @ApiOperation({ summary: 'Kiosk: submit citizen response (OTP value, confirmation, etc.)' })
  citizenInput(@Param('id') id: string, @Body() body: CitizenInputDto) {
    return this.jobs.submitCitizenInput(id, body);
  }

  @Get(':id/poll-input')
  @ApiOperation({ summary: 'Runner: poll for pending citizen input (short-poll)' })
  pollInput(@Param('id') id: string) {
    return this.jobs.pollCitizenInput(id);
  }

  // ─── Interactive remote control ───────────────────────────────────────────

  @Post(':id/interact')
  @HttpCode(200)
  @ApiOperation({ summary: 'Kiosk: send a tap/key/scroll/finish event to the live browser' })
  interact(@Param('id') id: string, @Body() body: InteractEventDto) {
    return this.jobs.enqueueInteraction(id, body);
  }

  @Get(':id/interactions')
  @ApiOperation({ summary: 'Runner: drain queued interaction events (short-poll)' })
  interactions(@Param('id') id: string) {
    return this.jobs.drainInteractions(id);
  }

  @Post(':id/report-focus')
  @HttpCode(200)
  @ApiOperation({ summary: 'Runner: report whether a text input is focused (auto keyboard)' })
  reportFocus(@Param('id') id: string, @Body() body: ReportFocusDto) {
    return this.jobs.reportInputFocus(id, body.focused);
  }

  // ─── Recorder ──────────────────────────────────────────────────────────────

  @Post(':id/record-action')
  @HttpCode(200)
  @ApiOperation({ summary: 'Runner: report a captured action during recording' })
  recordAction(@Param('id') id: string, @Body() body: RecordActionDto) {
    return this.jobs.recordAction(id, body as any);
  }

  @Get(':id/recording')
  @ApiOperation({ summary: 'CMS: fetch the buffered recorded actions for a record job' })
  recording(@Param('id') id: string) {
    return this.jobs.getRecording(id);
  }
}
