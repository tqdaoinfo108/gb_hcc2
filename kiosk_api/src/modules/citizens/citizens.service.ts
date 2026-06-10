import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { VerificationMethod, VerificationStatus } from '@prisma/client';

@Injectable()
export class CitizensService {
  constructor(private prisma: PrismaService) {}

  async findOrCreateByNationalId(nationalId: string, data: { fullName: string; dateOfBirth?: Date; gender?: string; address?: string }) {
    return this.prisma.citizen.upsert({
      where: { nationalId },
      update: { ...data, lastVerifiedAt: new Date() },
      create: { nationalId, ...data, consentGiven: true, consentAt: new Date() },
    });
  }

  async findById(id: string) {
    const c = await this.prisma.citizen.findUnique({
      where: { id, deletedAt: null },
      include: { profile: true },
    });
    if (!c) throw new NotFoundException('Citizen not found');
    return c;
  }

  async logVerification(citizenId: string, sessionId: string, method: VerificationMethod, success: boolean, data?: object) {
    await this.prisma.identityVerification.create({
      data: {
        citizenId,
        sessionId,
        method,
        status: success ? VerificationStatus.VERIFIED : VerificationStatus.FAILED,
        verifiedData: success ? data : undefined,
        verifiedAt: success ? new Date() : undefined,
      },
    });
    await this.prisma.authenticationLog.create({
      data: { citizenId, sessionId, method, success },
    });
  }
}
