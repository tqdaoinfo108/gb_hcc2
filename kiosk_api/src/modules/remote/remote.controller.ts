import { Body, Controller, Get, Param, Post, Query, Headers } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { RemoteService } from './remote.service';
import { AckCommandDto, IssueCommandDto } from './remote.dto';

@ApiTags('remote')
@Controller('remote')
export class RemoteController {
  constructor(private readonly remote: RemoteService) {}

  @Get('devices')
  @ApiOperation({ summary: 'List devices for the remote console (optionally scoped to one location)' })
  list(@Query('locationId') locationId?: string) {
    return this.remote.listDevices(locationId ? [locationId] : null);
  }

  @Get('devices/:id')
  @ApiOperation({ summary: 'Full remote-debug detail for one device' })
  detail(@Param('id') id: string) {
    return this.remote.deviceDetail(id);
  }

  @Post('devices/:id/command')
  @ApiOperation({ summary: 'Issue a remote command to a device' })
  command(
    @Param('id') id: string,
    @Body() dto: IssueCommandDto,
    @Headers('x-actor-id') actorId?: string,
  ) {
    return this.remote.issueCommand(id, dto, actorId);
  }

  @Post('ack')
  @ApiOperation({ summary: 'Device acknowledges the result of a command' })
  ack(@Body() dto: AckCommandDto) {
    return this.remote.ackCommand(dto);
  }
}
