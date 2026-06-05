import { Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { compare } from "bcryptjs";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({
      where: { email },
      include: {
        roles: {
          include: {
            role: {
              include: { permissions: { include: { permission: true } } }
            }
          }
        }
      }
    });

    if (!user || user.status !== "ACTIVE") {
      throw new UnauthorizedException("Invalid credentials");
    }

    const validPassword = await compare(password, user.passwordHash);
    if (!validPassword) {
      throw new UnauthorizedException("Invalid credentials");
    }

    const roles = user.roles.map((item) => item.role.name);
    const permissions = user.roles.flatMap((item) =>
      item.role.permissions.map((permission) => permission.permission.key)
    );

    return {
      accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, roles, permissions }),
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        roles,
        permissions
      }
    };
  }
}
