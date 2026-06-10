import { Controller, Get, Post, Body, Query } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { FeedbackService } from './feedback.service';
import { FeedbackTarget } from '@prisma/client';
import { SubmitFeedbackDto } from './feedback.dto';

@ApiTags('feedback')
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly service: FeedbackService) {}

  @Post()
  @ApiOperation({ summary: 'Submit feedback' })
  submit(@Body() body: SubmitFeedbackDto) {
    return this.service.submit(body);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get feedback statistics' })
  stats(@Query('targetType') targetType?: FeedbackTarget) {
    return this.service.getStats(targetType);
  }

  @Get('recent')
  @ApiOperation({ summary: 'Get recent feedback' })
  recent(@Query('limit') limit?: number) {
    return this.service.getRecent(limit ? +limit : 20);
  }
}
