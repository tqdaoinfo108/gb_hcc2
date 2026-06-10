import { Controller, Get, Post } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { AdminService } from './admin.service';

@ApiTags('admin')
@Controller('admin')
export class AdminController {
  constructor(private readonly service: AdminService) {}

  @Get('roles')
  @ApiOperation({ summary: 'Get all roles with permissions' })
  getRoles() { return this.service.getRoles(); }

  @Get('permissions')
  @ApiOperation({ summary: 'Get all permissions' })
  getPermissions() { return this.service.getPermissions(); }

  @Post('seed')
  @ApiOperation({ summary: 'Seed default roles and permissions' })
  seed() { return this.service.seedDefaultRolesAndPermissions(); }
}
