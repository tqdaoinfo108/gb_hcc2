import { Controller, Get, Post, Patch, Delete, Param, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { QueueService } from './queue.service';

@ApiTags('queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly service: QueueService) {}

  /** Seed default queue services + counters (idempotent) */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Seed default queue services (idempotent)' })
  seed() {
    return this.service.seedServices();
  }

  /** List all active services with waiting-ticket count */
  @Get('services')
  @ApiOperation({ summary: 'Get all active queue services' })
  getServices() {
    return this.service.getServices();
  }

  /** Real-time stats for a single service */
  @Get('services/:id/stats')
  @ApiOperation({ summary: 'Get live stats for one service (waiting, serving, estimate)' })
  getStats(@Param('id') id: string) {
    return this.service.getServiceStats(id);
  }

  /** Counters of a service, each with the currently-serving ticket */
  @Get('services/:id/counters')
  @ApiOperation({ summary: 'Get counters (with current ticket) for a service' })
  getCounters(@Param('id') id: string) {
    return this.service.getCounters(id);
  }

  /** Tickets with WAITING status, ordered by priority+FIFO */
  @Get(':serviceId/waiting')
  @ApiOperation({ summary: 'Get waiting tickets for a service' })
  getWaiting(@Param('serviceId') id: string) {
    return this.service.getWaiting(id);
  }

  /** Issue a new ticket — called by kiosk client */
  @Post(':serviceId/issue')
  @ApiOperation({ summary: 'Issue a queue ticket' })
  issue(
    @Param('serviceId') id: string,
    @Body() body: { kioskId?: string; sessionId?: string },
  ) {
    return this.service.issueTicket(id, body.kioskId, body.sessionId);
  }

  /** Call the next WAITING ticket to a counter — called by staff / CMS */
  @Post(':serviceId/call-next')
  @ApiOperation({ summary: 'Call next ticket to a counter' })
  callNext(
    @Param('serviceId') serviceId: string,
    @Body('counterId') counterId: string,
  ) {
    return this.service.callNext(serviceId, counterId);
  }

  /** Mark a ticket as COMPLETED */
  @Patch('tickets/:id/complete')
  @ApiOperation({ summary: 'Mark ticket as completed' })
  complete(@Param('id') id: string) {
    return this.service.completeTicket(id);
  }

  /** Cancel a WAITING ticket */
  @Patch('tickets/:id/cancel')
  @ApiOperation({ summary: 'Cancel a waiting ticket' })
  cancel(@Param('id') id: string) {
    return this.service.cancelTicket(id);
  }

  // ── CMS: Queue Service CRUD ──────────────────────────────────

  /** Create a new queue service */
  @Post('services')
  @ApiOperation({ summary: 'Create a new queue service (CMS)' })
  createService(
    @Body()
    body: {
      code: string;
      name: string;
      nameEn?: string;
      description?: string;
      colorHex?: string;
      prefix?: string;
    },
  ) {
    return this.service.createService(body);
  }

  /** Update queue service name / color / prefix / description */
  @Patch('services/:id')
  @ApiOperation({ summary: 'Update a queue service (CMS)' })
  updateService(
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      nameEn?: string;
      description?: string;
      colorHex?: string;
      prefix?: string;
      isActive?: boolean;
    },
  ) {
    return this.service.updateService(id, body);
  }

  /** Soft-delete a queue service and all its counters */
  @Delete('services/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a queue service (CMS, soft-delete)' })
  deleteService(@Param('id') id: string) {
    return this.service.deleteService(id);
  }

  // ── CMS: Counter CRUD ─────────────────────────────────────────

  /** Add a counter to a service */
  @Post('services/:serviceId/counters')
  @ApiOperation({ summary: 'Add a counter to a queue service (CMS)' })
  createCounter(
    @Param('serviceId') serviceId: string,
    @Body() body: { number: string; name?: string },
  ) {
    return this.service.createCounter(serviceId, body);
  }

  /** Remove a counter */
  @Delete('counters/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a counter (CMS, soft-delete)' })
  deleteCounter(@Param('id') id: string) {
    return this.service.deleteCounter(id);
  }
}
