import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma.service';

export interface UpsertHomeServiceDto {
  code?: string;
  locationId?: string | null;
  name?: string;
  nameEn?: string;
  description?: string;
  icon?: string;
  colorHex?: string;
  bgColorHex?: string;
  screenId?: string;
  badge?: string | null;
  sortOrder?: number;
  isVisible?: boolean;
}

@Injectable()
export class HomeServicesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Public (kiosk) — visible services for a location, falling back to the
   * global default set (locationId = null) when the location has none.
   */
  async getVisible(locationId?: string) {
    if (locationId) {
      const own = await this.prisma.kioskHomeService.findMany({
        where: { locationId, isVisible: true, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
      });
      if (own.length) return own;
    }
    return this.prisma.kioskHomeService.findMany({
      where: { locationId: null, isVisible: true, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  /** CMS — all services (incl. hidden) for a scope. `locationId` null/absent = global set. */
  async getAll(locationId?: string | null) {
    return this.prisma.kioskHomeService.findMany({
      where: { locationId: locationId ?? null, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
  }

  async create(dto: UpsertHomeServiceDto) {
    try {
      return await this.prisma.kioskHomeService.create({
        data: {
          locationId: dto.locationId ?? null,
          code: dto.code ?? `SVC_${Date.now()}`,
          name: dto.name ?? 'Dịch vụ mới',
          nameEn: dto.nameEn,
          description: dto.description,
          icon: dto.icon,
          colorHex: dto.colorHex,
          bgColorHex: dto.bgColorHex,
          screenId: dto.screenId ?? 'submit',
          badge: dto.badge ?? null,
          sortOrder: dto.sortOrder ?? 99,
          isVisible: dto.isVisible ?? true,
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Mã dịch vụ đã tồn tại trong địa điểm này');
      }
      throw err;
    }
  }

  async update(id: string, dto: UpsertHomeServiceDto) {
    const exists = await this.prisma.kioskHomeService.findUnique({ where: { id } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Home service ${id} not found`);
    try {
      return await this.prisma.kioskHomeService.update({ where: { id }, data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException('Mã dịch vụ đã tồn tại');
      }
      throw err;
    }
  }

  async remove(id: string) {
    const exists = await this.prisma.kioskHomeService.findUnique({ where: { id } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Home service ${id} not found`);
    await this.prisma.kioskHomeService.update({ where: { id }, data: { deletedAt: new Date() } });
    return { ok: true };
  }

  /** Idempotent seed — creates the default tile set for a scope (global or a location). */
  async seed(locationId?: string | null) {
    const loc = locationId ?? null;
    const existing = await this.prisma.kioskHomeService.count({ where: { locationId: loc, deletedAt: null } });
    if (existing > 0) {
      return { seeded: false, message: 'Home services already exist', count: existing };
    }

    const DEFAULTS = [
      {
        code: 'SUBMIT',
        name: 'Nộp hồ sơ',
        nameEn: 'Submit Application',
        description: 'Thủ tục hành chính trực tuyến',
        icon: 'submit',
        colorHex: 'var(--blue)',
        bgColorHex: 'var(--blue-lt)',
        screenId: 'submit',
        sortOrder: 1,
        isVisible: true,
        badge: null,
      },
      {
        code: 'WALLET',
        name: 'Kho giấy tờ',
        nameEn: 'Document Wallet',
        description: 'Quản lý tài liệu cá nhân',
        icon: 'wallet',
        colorHex: 'var(--teal)',
        bgColorHex: 'var(--teal-lt)',
        screenId: 'wallet',
        sortOrder: 2,
        isVisible: true,
        badge: '6 giấy tờ',
      },
      {
        code: 'QUEUE',
        name: 'Bốc số',
        nameEn: 'Queue Ticket',
        description: 'Lấy số thứ tự phục vụ',
        icon: 'queue',
        colorHex: 'var(--orange)',
        bgColorHex: 'var(--orange-lt)',
        screenId: 'queue',
        sortOrder: 3,
        isVisible: true,
        badge: null,
      },
      {
        code: 'LOOKUP',
        name: 'Tra cứu',
        nameEn: 'Lookup',
        description: 'Kiểm tra tiến độ hồ sơ',
        icon: 'search',
        colorHex: 'var(--ink-3)',
        bgColorHex: 'var(--ink-8)',
        screenId: 'lookup',
        sortOrder: 4,
        isVisible: true,
        badge: null,
      },
      {
        code: 'AI',
        name: 'Trợ lý ảo',
        nameEn: 'AI Assistant',
        description: 'Hỗ trợ thông minh 24/7',
        icon: 'ai',
        colorHex: 'var(--purple)',
        bgColorHex: 'var(--purple-lt)',
        screenId: 'ai',
        sortOrder: 5,
        isVisible: true,
        badge: null,
      },
      {
        code: 'FEEDBACK',
        name: 'Đánh giá dịch vụ',
        nameEn: 'Feedback',
        description: 'Góp ý chất lượng phục vụ',
        icon: 'rate',
        colorHex: 'var(--green)',
        bgColorHex: 'var(--green-lt)',
        screenId: 'feedback',
        sortOrder: 6,
        isVisible: true,
        badge: null,
      },
    ];

    await this.prisma.kioskHomeService.createMany({
      data: DEFAULTS.map((d) => ({ ...d, locationId: loc })),
    });
    return { seeded: true, message: 'Default home services created', count: DEFAULTS.length };
  }
}
