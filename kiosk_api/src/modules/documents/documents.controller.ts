import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { DocumentsService } from './documents.service';

@ApiTags('documents')
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Get('categories')
  @ApiOperation({ summary: 'Get document categories' })
  getCategories() {
    return this.service.getCategories();
  }

  @Get('owner/:ownerId')
  @ApiOperation({ summary: 'Get all documents for a citizen' })
  getByOwner(@Param('ownerId') ownerId: string) {
    return this.service.findByOwner(ownerId);
  }

  @Post()
  @ApiOperation({ summary: 'Create digital document' })
  create(@Body() body: any) {
    return this.service.create(body);
  }
}
