import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';

@Injectable()
export class AiService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.aIConversation.findMany({
      orderBy: { createdAt: 'desc' },
      include: { session: true },
    });
  }
}
