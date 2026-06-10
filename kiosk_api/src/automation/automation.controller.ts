import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';

@ApiTags('automation')
@Controller('automation')
export class AutomationController {
  @Get('status')
  status() {
    return { status: 'Legacy automation module — use new domain modules.' };
  }
}
