import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CitizensService } from './citizens.service';

@ApiTags('citizens')
@Controller('citizens')
export class CitizensController {
  constructor(private readonly service: CitizensService) {}

  @Post('verify')
  @ApiOperation({ summary: 'Verify citizen identity' })
  verify(@Body() body: { nationalId: string; fullName: string; sessionId: string; method: string }) {
    return this.service.findOrCreateByNationalId(body.nationalId, { fullName: body.fullName });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get citizen by ID' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
