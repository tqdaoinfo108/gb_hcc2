import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProceduresService } from './procedures.service';

@ApiTags('procedures')
@Controller('procedures')
export class ProceduresController {
  constructor(private readonly service: ProceduresService) {}

  @Get()
  @ApiOperation({ summary: 'List all procedures' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  findAll(@Query('categoryId') categoryId?: string, @Query('search') search?: string) {
    return this.service.findAll(categoryId, search);
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get procedure categories' })
  getCategories() {
    return this.service.getCategories();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get procedure detail with requirements' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }
}
