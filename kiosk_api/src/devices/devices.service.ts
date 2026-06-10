import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list() {
    return this.prisma.kioskDevice.findMany({
      where: { deletedAt: null },
      include: { location: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}
