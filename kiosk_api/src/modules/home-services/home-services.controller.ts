import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Param,
  Query,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { HomeServicesService, UpsertHomeServiceDto } from './home-services.service';

@Controller('kiosk/home-services')
export class HomeServicesController {
  constructor(private readonly svc: HomeServicesService) {}

  /** Public — kiosk client calls this; visible services for its location (falls back to global). */
  @Get()
  getVisible(@Query('locationId') locationId?: string) {
    return this.svc.getVisible(locationId);
  }

  /** CMS — all (incl. hidden) for a scope. `locationId` absent = global set. */
  @Get('all')
  getAll(@Query('locationId') locationId?: string) {
    return this.svc.getAll(locationId ?? null);
  }

  /** CMS — idempotent seed of the default tile set (global or for a location). */
  @Post('seed')
  @HttpCode(HttpStatus.OK)
  seed(@Query('locationId') locationId?: string) {
    return this.svc.seed(locationId ?? null);
  }

  /** CMS — create a tile (optionally scoped to a location). */
  @Post()
  create(@Body() dto: UpsertHomeServiceDto) {
    return this.svc.create(dto);
  }

  /** CMS — update a single home service. */
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpsertHomeServiceDto) {
    return this.svc.update(id, dto);
  }

  /** CMS — soft-delete a tile. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string) {
    return this.svc.remove(id);
  }
}
