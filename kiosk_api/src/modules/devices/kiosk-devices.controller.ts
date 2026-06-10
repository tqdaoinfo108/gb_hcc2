import { Controller, Get, Post, Patch, Param, Body, Req } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { KioskDevicesService } from './kiosk-devices.service';
import { CreateLocationDto, HeartbeatDto, UpdateKioskConfigDto, UpdateLocationDto } from './kiosk-devices.dto';

@ApiTags('kiosk-devices')
@Controller('kiosk-devices')
export class KioskDevicesController {
  constructor(private readonly service: KioskDevicesService) {}

  @Get()
  @ApiOperation({ summary: 'Get all kiosk devices' })
  findAll() { return this.service.findAll(); }

  @Get('locations')
  @ApiOperation({ summary: 'Get all locations' })
  locations() { return this.service.getLocations(); }

  @Post('locations')
  @ApiOperation({ summary: 'Create a kiosk location' })
  createLocation(@Body() body: CreateLocationDto) { return this.service.upsertLocation(body); }

  @Patch('locations/:id')
  @ApiOperation({ summary: 'Update a kiosk location' })
  updateLocation(@Param('id') id: string, @Body() body: UpdateLocationDto) {
    return this.service.updateLocation(id, body);
  }

  @Get('config/:deviceId')
  @ApiOperation({ summary: 'Get kiosk runtime configuration by fixed device ID' })
  config(@Param('deviceId') deviceId: string) { return this.service.getRuntimeConfig(deviceId); }

  @Get(':id')
  @ApiOperation({ summary: 'Get device by ID' })
  findOne(@Param('id') id: string) { return this.service.findById(id); }

  @Post(':deviceId/heartbeat')
  @ApiOperation({ summary: 'Device heartbeat' })
  heartbeat(@Param('deviceId') deviceId: string, @Body() body: HeartbeatDto, @Req() request: any) {
    const forwardedFor = request.headers?.['x-forwarded-for'];
    const requestIp = typeof forwardedFor === 'string'
      ? forwardedFor.split(',')[0].trim()
      : request.ip;
    return this.service.heartbeat(deviceId, body, requestIp);
  }

  @Patch(':id/config')
  @ApiOperation({ summary: 'Update kiosk configuration and maintenance mode' })
  updateConfig(@Param('id') id: string, @Body() body: UpdateKioskConfigDto) {
    return this.service.updateConfig(id, body);
  }
}
