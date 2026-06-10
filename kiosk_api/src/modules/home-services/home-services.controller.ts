import {
  Controller,
  Get,
  Patch,
  Post,
  Param,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HomeServicesService, UpsertHomeServiceDto } from './home-services.service';

@Controller('kiosk/home-services')
export class HomeServicesController {
  constructor(private readonly svc: HomeServicesService) {}

  /** Public — kiosk client calls this; returns only visible services */
  @Get()
  getVisible() {
    return this.svc.getVisible();
  }

  /** CMS — returns all including hidden */
  @Get('all')
  getAll() {
    return this.svc.getAll();
  }

  /** CMS — idempotent seed */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  seed() {
    return this.svc.seed();
  }

  /** CMS — update a single home service (name, visibility, color, badge, sortOrder…) */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertHomeServiceDto) {
    return this.svc.update(id, dto);
  }
}
