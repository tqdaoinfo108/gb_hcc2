import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';

@Injectable()
export class DocumentsService {
  constructor(private prisma: PrismaService) {}

  async findByOwner(ownerId: string) {
    return this.prisma.digitalDocument.findMany({
      where: { ownerId, deletedAt: null },
      include: { category: true, files: { where: { deletedAt: null } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: { ownerId: string; categoryId: string; title: string; documentType: string; documentNumber?: string; issuedBy?: string; issuedDate?: Date; expiryDate?: Date }) {
    return this.prisma.digitalDocument.create({ data });
  }

  async addFile(documentId: string, file: { fileName: string; mimeType: string; sizeBytes: number; storagePath: string; bucketName: string }) {
    const doc = await this.prisma.digitalDocument.findUnique({ where: { id: documentId } });
    const currentVersion = await this.prisma.documentVersion.count({ where: { documentId } });
    await this.prisma.documentVersion.create({
      data: { documentId, version: currentVersion + 1, snapshot: doc as object },
    });
    return this.prisma.documentFile.create({ data: { documentId, ...file } });
  }

  async logAccess(documentId: string, action: string, accessorId?: string, sessionId?: string) {
    return this.prisma.documentAccessLog.create({
      data: { documentId, action, accessorId, sessionId, accessorType: accessorId ? 'CITIZEN' : 'SYSTEM' },
    });
  }

  async getCategories() {
    return this.prisma.documentCategory.findMany({
      where: { deletedAt: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
