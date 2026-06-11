import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { ProceduresService } from './procedures.service';
import { CreateProcedureDto, UpdateProcedureDto, CreateCategoryDto, UpdateCategoryDto } from './procedures.dto';

@ApiTags('procedures')
@Controller('procedures')
export class ProceduresController {
  constructor(private readonly service: ProceduresService) {}

  @Get()
  @ApiOperation({ summary: 'List all procedures' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  findAll(
    @Query('categoryId') categoryId?: string,
    @Query('search') search?: string,
    @Query('includeInactive') inc?: string,
  ) {
    return this.service.findAll(categoryId, search, inc === 'true');
  }

  @Get('categories')
  @ApiOperation({ summary: 'Get procedure categories' })
  @ApiQuery({ name: 'includeInactive', required: false, type: Boolean })
  getCategories(@Query('includeInactive') inc?: string) {
    return this.service.getCategories(inc === 'true');
  }

  @Get('grouped')
  @ApiOperation({ summary: 'Categories with their procedures + online flag (kiosk accordion)' })
  getGrouped() {
    return this.service.getGroupedByCategory();
  }

  @Post()
  @ApiOperation({ summary: 'Create a new procedure' })
  create(@Body() body: CreateProcedureDto) {
    return this.service.create(body);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get procedure detail with requirements' })
  findOne(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a procedure' })
  update(@Param('id') id: string, @Body() body: UpdateProcedureDto) {
    return this.service.update(id, body);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a procedure' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  // ── Categories CRUD ──────────────────────────────────────────────────────────

  @Post('categories')
  @ApiOperation({ summary: 'Create a procedure category' })
  createCategory(@Body() body: CreateCategoryDto) {
    return this.service.createCategory(body);
  }

  @Patch('categories/:id')
  @ApiOperation({ summary: 'Update a procedure category' })
  updateCategory(@Param('id') id: string, @Body() body: UpdateCategoryDto) {
    return this.service.updateCategory(id, body);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete a procedure category' })
  removeCategory(@Param('id') id: string) {
    return this.service.removeCategory(id);
  }
}
