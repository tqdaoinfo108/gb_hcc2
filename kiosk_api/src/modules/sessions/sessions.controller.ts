import { Controller, Get, Post, Patch, Param, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SessionsService } from './sessions.service';
import { CreateSessionDto } from './sessions.dto';

@ApiTags('sessions')
@Controller('sessions')
export class SessionsController {
  constructor(private readonly service: SessionsService) {}

  @Post()
  @ApiOperation({ summary: 'Create new kiosk session' })
  create(@Body() body: CreateSessionDto) {
    return this.service.create(body.deviceId, body.citizenId, body.language);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get all active sessions' })
  getActive(@Query('deviceId') deviceId?: string) {
    return this.service.getActiveSessions(deviceId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get session by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id/screen')
  @ApiOperation({ summary: 'Update current screen' })
  updateScreen(@Param('id') id: string, @Body('screen') screen: string) {
    return this.service.updateScreen(id, screen);
  }

  @Patch(':id/complete')
  @ApiOperation({ summary: 'Complete session' })
  complete(@Param('id') id: string) {
    return this.service.complete(id);
  }

  @Patch(':id/expire')
  @ApiOperation({ summary: 'Expire session (timeout)' })
  expire(@Param('id') id: string) {
    return this.service.expire(id);
  }

  @Post(':id/events')
  @ApiOperation({ summary: 'Log session event' })
  logEvent(@Param('id') id: string, @Body() body: { eventType: string; screen?: string; eventData?: object }) {
    return this.service.logEvent(id, body.eventType, body.screen, body.eventData);
  }
}
