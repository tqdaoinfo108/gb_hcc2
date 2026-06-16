import { Controller, Get, Post, Patch, Delete, Param, Query, Body, HttpCode } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEmail, IsArray, MinLength } from 'class-validator';
import { AdminService } from './admin.service';
import { AuditService } from '../../audit/audit.service';

class CreateUserDto {
  @IsString() username!: string;
  @IsEmail() email!: string;
  @IsString() fullName!: string;
  @IsString() @MinLength(6) password!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isSuperAdmin?: boolean;
  @IsOptional() @IsArray() roleCodes?: string[];
  @IsOptional() @IsArray() locationIds?: string[];
  @IsOptional() @IsArray() modules?: string[];
}

class UpdateUserDto {
  @IsOptional() @IsString() fullName?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isSuperAdmin?: boolean;
  @IsOptional() @IsString() @MinLength(6) password?: string;
  @IsOptional() @IsArray() roleCodes?: string[];
  @IsOptional() @IsArray() locationIds?: string[];
  @IsOptional() @IsArray() modules?: string[];
}

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('roles')
  @ApiOperation({ summary: 'Get all roles with permissions' })
  getRoles() { return this.service.getRoles(); }

  @Get('permissions')
  @ApiOperation({ summary: 'Get all permissions' })
  getPermissions() { return this.service.getPermissions(); }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default roles and permissions' })
  seed() { return this.service.seedDefaultRolesAndPermissions(); }

  // ── Users ──────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'List admin users (with roles + locations)' })
  getUsers() { return this.service.getUsers(); }

  @Get('locations')
  @ApiOperation({ summary: 'List locations for assignment dropdowns' })
  getLocations() { return this.service.getLocationsList(); }

  @Get('modules')
  @ApiOperation({ summary: 'Catalog of CMS modules/services for per-user access' })
  getModules() { return this.service.getModules(); }

  @Get('audit-logs')
  @ApiOperation({ summary: 'System audit log (CRUD), scoped by location' })
  @ApiQuery({ name: 'locationId', required: false })
  @ApiQuery({ name: 'module', required: false })
  @ApiQuery({ name: 'action', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  auditLogs(
    @Query('locationId') locationId?: string,
    @Query('module') module?: string,
    @Query('action') action?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.audit.list({
      locationId: locationId || null,
      module,
      action,
      page: page ? +page : undefined,
      limit: limit ? +limit : undefined,
    });
  }

  @Post('users')
  @ApiOperation({ summary: 'Create an admin user' })
  createUser(@Body() body: CreateUserDto) { return this.service.createUser(body); }

  @Patch('users/:id')
  @ApiOperation({ summary: 'Update an admin user (roles, locations, password)' })
  updateUser(@Param('id') id: string, @Body() body: UpdateUserDto) {
    return this.service.updateUser(id, body);
  }

  @Delete('users/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Soft-delete an admin user' })
  deleteUser(@Param('id') id: string) { return this.service.deleteUser(id); }
}
