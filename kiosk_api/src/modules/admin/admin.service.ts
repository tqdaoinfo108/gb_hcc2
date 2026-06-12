import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import * as bcrypt from 'bcryptjs';
import { MODULES } from '../../common/modules';

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

  // ── User management (per-location + roles) ─────────────────────────────────
  private userInclude = {
    userRoles: { include: { role: true } },
    userLocations: { include: { location: { select: { id: true, code: true, name: true } } } },
    moduleAccess: true,
    organization: { select: { id: true, name: true } },
  } as const;

  private async setModules(userId: string, modules?: string[]) {
    if (!modules) return;
    await this.prisma.userModuleAccess.deleteMany({ where: { userId } });
    for (const module of modules) {
      await this.prisma.userModuleAccess.create({ data: { userId, module } });
    }
  }

  async getUsers() {
    return this.prisma.adminUser.findMany({
      where: { deletedAt: null },
      include: this.userInclude,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUser(id: string) {
    const u = await this.prisma.adminUser.findFirst({ where: { id, deletedAt: null }, include: this.userInclude });
    if (!u) throw new NotFoundException('Không tìm thấy người dùng');
    return u;
  }

  getModules() {
    return MODULES;
  }

  async getLocationsList() {
    return this.prisma.kioskLocation.findMany({
      where: { deletedAt: null },
      select: { id: true, code: true, name: true },
      orderBy: [{ province: 'asc' }, { name: 'asc' }],
    });
  }

  private async setRoles(userId: string, roleCodes?: string[]) {
    if (!roleCodes) return;
    const roles = await this.prisma.role.findMany({ where: { code: { in: roleCodes }, deletedAt: null } });
    await this.prisma.userRole.deleteMany({ where: { userId } });
    for (const r of roles) {
      await this.prisma.userRole.create({ data: { userId, roleId: r.id } });
    }
  }

  private async setLocations(userId: string, locationIds?: string[]) {
    if (!locationIds) return;
    await this.prisma.userLocation.deleteMany({ where: { userId } });
    for (const locationId of locationIds) {
      await this.prisma.userLocation.create({ data: { userId, locationId } });
    }
  }

  async createUser(dto: {
    username: string; email: string; fullName: string; password: string;
    phone?: string; isSuperAdmin?: boolean; roleCodes?: string[]; locationIds?: string[]; modules?: string[];
  }) {
    const exists = await this.prisma.adminUser.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }], deletedAt: null },
    });
    if (exists) throw new ConflictException('Tên đăng nhập hoặc email đã tồn tại');
    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.adminUser.create({
      data: {
        username: dto.username, email: dto.email, fullName: dto.fullName,
        phone: dto.phone, passwordHash, isActive: true,
        isSuperAdmin: dto.isSuperAdmin ?? false,
      },
    });
    await this.setRoles(user.id, dto.roleCodes);
    await this.setLocations(user.id, dto.isSuperAdmin ? [] : dto.locationIds);
    await this.setModules(user.id, dto.isSuperAdmin ? [] : dto.modules);
    return this.getUser(user.id);
  }

  async updateUser(id: string, dto: {
    fullName?: string; phone?: string; isActive?: boolean; isSuperAdmin?: boolean;
    password?: string; roleCodes?: string[]; locationIds?: string[]; modules?: string[];
  }) {
    await this.getUser(id);
    const data: Record<string, unknown> = {};
    if (dto.fullName !== undefined) data.fullName = dto.fullName;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.isSuperAdmin !== undefined) data.isSuperAdmin = dto.isSuperAdmin;
    if (dto.password) { data.passwordHash = await bcrypt.hash(dto.password, 10); data.passwordChangedAt = new Date(); }
    await this.prisma.adminUser.update({ where: { id }, data });
    await this.setRoles(id, dto.roleCodes);
    await this.setLocations(id, dto.isSuperAdmin ? [] : dto.locationIds);
    await this.setModules(id, dto.isSuperAdmin ? [] : dto.modules);
    return this.getUser(id);
  }

  async deleteUser(id: string) {
    await this.getUser(id);
    await this.prisma.adminUser.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false },
    });
    return { ok: true };
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
