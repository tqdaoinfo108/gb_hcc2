import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { compare } from 'bcryptjs';
import { PrismaService } from '../prisma.service';
import { ALL_MODULE_KEYS } from '../common/modules';

const USER_INCLUDE = {
  userRoles: {
    include: {
      role: { include: { rolePermissions: { include: { permission: true } } } },
    },
  },
  userLocations: { include: { location: true } },
  moduleAccess: true,
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** Shape the public user object returned to the client. */
  private shape(user: any) {
    const roles = user.userRoles.map((ur: any) => ur.role.code);
    const permissions = user.userRoles.flatMap((ur: any) =>
      ur.role.rolePermissions.map((rp: any) => rp.permission.code),
    );
    const locations = user.userLocations.map((ul: any) => ({
      id: ul.location.id,
      code: ul.location.code,
      name: ul.location.name,
    }));
    // Super admins implicitly have every module; others only their granted set.
    const modules: string[] = user.isSuperAdmin
      ? ALL_MODULE_KEYS
      : (user.moduleAccess ?? []).map((m: any) => m.module);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      fullName: user.fullName,
      avatarUrl: user.avatarUrl ?? null,
      isSuperAdmin: user.isSuperAdmin,
      roles,
      permissions,
      modules,
      // Super admins implicitly manage every location (empty list = all).
      locations,
      locationIds: locations.map((l: any) => l.id),
    };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { email, deletedAt: null },
      include: USER_INCLUDE,
    });
    if (!user || !user.isActive) throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');

    const ok = await compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Sai tài khoản hoặc mật khẩu');

    await this.prisma.adminUser.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    const shaped = this.shape(user);
    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      isSuperAdmin: user.isSuperAdmin,
      roles: shaped.roles,
    });
    return { accessToken, user: shaped };
  }

  /** Resolve the current user from a verified token's subject id. */
  async me(userId: string) {
    const user = await this.prisma.adminUser.findFirst({
      where: { id: userId, deletedAt: null },
      include: USER_INCLUDE,
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.shape(user);
  }
}
