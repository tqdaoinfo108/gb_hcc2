import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { OtaService } from './ota.service';

@ApiTags('ota')
@Controller('ota')
export class OtaController {
  constructor(private readonly ota: OtaService) {}

  @Get('packages')
  packages() {
    return this.ota.packages();
  }
}
