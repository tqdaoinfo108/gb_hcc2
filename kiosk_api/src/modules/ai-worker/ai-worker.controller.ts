import { Controller, Get, Post, Patch, Delete, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { AIJobType, JobStatus } from '@prisma/client';
import { AIWorkerService } from './ai-worker.service';
import { AIJobService } from './ai-job.service';
import {
  RegisterAIWorkerDto, AIWorkerHeartbeatDto,
  DispatchAIJobDto, CompleteAIJobDto,
} from './ai-worker.dto';

// ─── Workers ──────────────────────────────────────────────────────────────────

@ApiTags('ai-workers / workers')
@Controller('ai-workers')
export class AIWorkerController {
  constructor(private workers: AIWorkerService) {}

  @Get()
  @ApiOperation({ summary: 'List all AI workers' })
  @ApiQuery({ name: 'includeOffline', required: false, type: Boolean })
  findAll(@Query('includeOffline') inc?: string) {
    return this.workers.findAll(inc === 'true');
  }

  @Get(':workerId')
  @ApiOperation({ summary: 'Get AI worker details' })
  findOne(@Param('workerId') id: string) { return this.workers.findById(id); }

  @Post('register')
  @ApiOperation({ summary: 'Worker self-registration' })
  register(@Body() body: RegisterAIWorkerDto) { return this.workers.register(body); }

  @Post(':workerId/heartbeat')
  @ApiOperation({ summary: 'Worker heartbeat / load update' })
  heartbeat(@Param('workerId') id: string, @Body() body: AIWorkerHeartbeatDto) {
    return this.workers.heartbeat(id, body);
  }

  @Post(':workerId/drain')
  @ApiOperation({ summary: 'Set worker to DRAINING state' })
  drain(@Param('workerId') id: string) { return this.workers.drain(id); }

  @Delete(':workerId')
  @ApiOperation({ summary: 'Remove worker registration' })
  remove(@Param('workerId') id: string) { return this.workers.remove(id); }

  @Post('mark-stale')
  @ApiOperation({ summary: 'Mark timed-out workers as OFFLINE (cron trigger)' })
  markStale() { return this.workers.markOfflineStaleWorkers(); }
}

// ─── Jobs ─────────────────────────────────────────────────────────────────────

@ApiTags('ai-workers / jobs')
@Controller('ai-jobs')
export class AIJobController {
  constructor(private jobs: AIJobService) {}

  @Get()
  @ApiOperation({ summary: 'List AI jobs with optional filters' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'workerId', required: false })
  @ApiQuery({ name: 'jobType', required: false, enum: AIJobType })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  findAll(
    @Query('status') status?: any,
    @Query('workerId') workerId?: string,
    @Query('jobType') jobType?: AIJobType,
    @Query('limit') limit?: string,
  ) {
    return this.jobs.findAll({ status: status as JobStatus, workerId, jobType, limit: limit ? +limit : undefined });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get AI job details' })
  findOne(@Param('id') id: string) { return this.jobs.findById(id); }

  @Post('dispatch')
  @ApiOperation({ summary: 'Dispatch a new AI job' })
  dispatch(@Body() body: DispatchAIJobDto) { return this.jobs.dispatch(body); }

  @Post(':id/running')
  @ApiOperation({ summary: 'Mark job as RUNNING (called by worker)' })
  markRunning(@Param('id') id: string) { return this.jobs.markRunning(id); }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Submit job result (called by worker)' })
  complete(@Param('id') id: string, @Body() body: CompleteAIJobDto) {
    return this.jobs.complete(id, body);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Retry a failed AI job' })
  retry(@Param('id') id: string) { return this.jobs.retry(id); }

  @Get('queue/:workerId')
  @ApiOperation({ summary: 'Dequeue pending jobs for a worker (worker polling)' })
  dequeue(@Param('workerId') workerId: string, @Query('limit') limit?: string) {
    return this.jobs.dequeueForWorker(workerId, limit ? +limit : 5);
  }
}
