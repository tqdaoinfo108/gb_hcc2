import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SelectorsService } from './selectors.service';

@ApiTags('selectors')
@Controller('selectors')
export class SelectorsController {
  constructor(private readonly selectors: SelectorsService) {}

  @Get()
  list() {
    return this.selectors.list();
  }
}
