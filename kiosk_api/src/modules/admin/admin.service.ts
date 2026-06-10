import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) {}

  async findByUsername(username: string) {
    return this.prisma.adminUser.findUnique({
      where: { username, deletedAt: null },
      include: { userRoles: { include: { role: { include: { rolePermissions: { include: { permission: true } } } } } } },
    });
  }

  async validatePassword(user: any, password: string) {
    return bcrypt.compare(password, user.passwordHash);
  }

  async updateLastLogin(id: string, ip?: string) {
    return this.prisma.adminUser.update({
      where: { id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });
  }

  async createAuditLog(adminId: string, action: string, module: string, data: { targetId?: string; targetType?: string; before?: object; after?: object; ipAddress?: string }) {
    return this.prisma.adminAuditLog.create({ data: { adminId, action, module, ...data } });
  }

  async getRoles() {
    return this.prisma.role.findMany({ where: { deletedAt: null }, include: { rolePermissions: { include: { permission: true } } } });
  }

  async getPermissions() {
    return this.prisma.permission.findMany({ where: { deletedAt: null } });
  }

  async seedDefaultRolesAndPermissions() {
    const roles = ['SUPER_ADMIN', 'MANAGER', 'OPERATOR', 'VIEWER'];
    for (const code of roles) {
      await this.prisma.role.upsert({
        where: { code },
        update: {},
        create: { code, name: code.replace('_', ' '), isSystem: true },
      });
    }
    const permissions = [
      { code: 'applications:read',    module: 'applications', action: 'READ' },
      { code: 'applications:update',  module: 'applications', action: 'UPDATE' },
      { code: 'queue:manage',         module: 'queue',        action: 'UPDATE' },
      { code: 'devices:manage',       module: 'devices',      action: 'UPDATE' },
      { code: 'reports:read',         module: 'reports',      action: 'READ' },
      { code: 'admin:manage',         module: 'admin',        action: 'CREATE' },
    ];
    for (const p of permissions) {
      await this.prisma.permission.upsert({ where: { code: p.code }, update: {}, create: p });
    }
  }
}
