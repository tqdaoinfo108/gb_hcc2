import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma.service';
import { CounterStatus, TicketStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { QueueGateway } from './queue.gateway';

@Injectable()
export class QueueService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: QueueGateway,
  ) {}

  // ──────────────────────────────────────────────────
  // READ
  // ──────────────────────────────────────────────────

  async getServices() {
    return this.prisma.queueService.findMany({
      where: { deletedAt: null, isActive: true },
      include: {
        counters: { where: { deletedAt: null }, orderBy: { number: 'asc' } },
        _count: { select: { tickets: { where: { status: TicketStatus.WAITING, deletedAt: null } } } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async getServiceStats(serviceId: string) {
    const [service, waitingCount, servingTicket] = await Promise.all([
      this.prisma.queueService.findUnique({ where: { id: serviceId } }),
      this.prisma.queueTicket.count({
        where: { serviceId, status: TicketStatus.WAITING, deletedAt: null },
      }),
      this.prisma.queueTicket.findFirst({
        where: { serviceId, status: { in: [TicketStatus.CALLED, TicketStatus.SERVING] } },
        orderBy: { calledAt: 'desc' },
      }),
    ]);
    if (!service) throw new NotFoundException(`Queue service ${serviceId} not found`);
    return {
      serviceId,
      serviceName: service.name,
      prefix:       service.prefix,
      waitingCount,
      currentServing:    servingTicket?.displayNumber ?? null,
      estimatedWaitMin:  waitingCount > 0 ? waitingCount * 5 : 0,
    };
  }

  async getCounters(serviceId: string) {
    return this.prisma.counter.findMany({
      where: { serviceId, deletedAt: null },
      orderBy: { number: 'asc' },
      include: {
        tickets: {
          where: { status: { in: [TicketStatus.CALLED, TicketStatus.SERVING] } },
          orderBy: { calledAt: 'desc' },
          take: 1,
        },
      },
    });
  }

  async getWaiting(serviceId: string) {
    return this.prisma.queueTicket.findMany({
      where: { serviceId, status: TicketStatus.WAITING, deletedAt: null },
      orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
    });
  }

  // ──────────────────────────────────────────────────
  // MUTATIONS
  // ──────────────────────────────────────────────────

  async issueTicket(serviceId: string, kioskId?: string, sessionId?: string) {
    // Verify service exists
    const svcExists = await this.prisma.queueService.findUnique({ where: { id: serviceId } });
    if (!svcExists) throw new NotFoundException(`Queue service ${serviceId} not found`);

    // If kioskId is provided, verify it exists to avoid FK violation
    if (kioskId) {
      const deviceExists = await this.prisma.kioskDevice.findUnique({ where: { id: kioskId } });
      if (!deviceExists) kioskId = undefined; // silently drop unknown device IDs
    }

    const ticket = await this.prisma.$transaction(async (tx) => {
      const service = await tx.queueService.update({
        where: { id: serviceId },
        data: { currentNumber: { increment: 1 } },
      });
      const num     = service.currentNumber;
      const display = `${service.prefix}${String(num).padStart(3, '0')}`;
      return tx.queueTicket.create({
        data: { serviceId, kioskId, sessionId, ticketNumber: num, displayNumber: display },
        include: { service: true },
      });
    });

    // How many are waiting ahead of this ticket
    const waitingAhead = await this.prisma.queueTicket.count({
      where: {
        serviceId,
        status: TicketStatus.WAITING,
        deletedAt: null,
        issuedAt: { lt: ticket.issuedAt },
      },
    });

    const stats = await this.getServiceStats(serviceId);
    this.gateway.broadcast('queue:ticket_issued',  { ticket, stats });
    this.gateway.broadcast('queue:service_stats',  stats);

    return {
      ...ticket,
      waitingAhead,
      estimatedWaitMin: (waitingAhead + 1) * 5,
    };
  }

  async callNext(serviceId: string, counterId: string) {
    // Verify counter belongs to service
    const counter = await this.prisma.counter.findFirst({
      where: { id: counterId, serviceId, deletedAt: null },
    });
    if (!counter) throw new NotFoundException('Counter not found for this service');

    const next = await this.prisma.queueTicket.findFirst({
      where: { serviceId, status: TicketStatus.WAITING, deletedAt: null },
      orderBy: [{ priority: 'desc' }, { issuedAt: 'asc' }],
    });
    if (!next) return null;

    await this.prisma.queueEvent.create({ data: { ticketId: next.id, eventType: 'CALLED' } });
    const updated = await this.prisma.queueTicket.update({
      where: { id: next.id },
      data: { status: TicketStatus.CALLED, counterId, calledAt: new Date() },
      include: { service: true },
    });

    const stats = await this.getServiceStats(serviceId);
    this.gateway.broadcast('queue:ticket_called', { ticket: updated, counterId, stats });
    this.gateway.broadcast('queue:service_stats', stats);

    return updated;
  }

  async completeTicket(id: string) {
    const ticket = await this.prisma.queueTicket.findUnique({ where: { id } });
    if (!ticket) throw new NotFoundException('Ticket not found');

    await this.prisma.queueEvent.create({ data: { ticketId: id, eventType: 'COMPLETED' } });
    const updated = await this.prisma.queueTicket.update({
      where: { id },
      data: { status: TicketStatus.COMPLETED, completedAt: new Date() },
    });

    const stats = await this.getServiceStats(ticket.serviceId);
    this.gateway.broadcast('queue:ticket_completed', { ticket: updated, stats });
    this.gateway.broadcast('queue:service_stats',    stats);

    return updated;
  }

  async cancelTicket(id: string) {
    const ticket = await this.prisma.queueTicket.findUnique({ where: { id } });
    if (!ticket)                                throw new NotFoundException('Ticket not found');
    if (ticket.status !== TicketStatus.WAITING) throw new BadRequestException('Only WAITING tickets can be cancelled');

    await this.prisma.queueEvent.create({ data: { ticketId: id, eventType: 'CANCELLED' } });
    const updated = await this.prisma.queueTicket.update({
      where: { id },
      data: { status: TicketStatus.CANCELLED },
    });

    const stats = await this.getServiceStats(ticket.serviceId);
    this.gateway.broadcast('queue:ticket_cancelled', { ticket: updated, stats });
    this.gateway.broadcast('queue:service_stats',    stats);

    return updated;
  }

  // ──────────────────────────────────────────────────
  // QUEUE SERVICE CRUD (CMS)
  // ──────────────────────────────────────────────────

  async createService(dto: {
    code: string;
    name: string;
    nameEn?: string;
    description?: string;
    colorHex?: string;
    prefix?: string;
  }) {
    try {
      return await this.prisma.queueService.create({ data: dto });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new ConflictException(`Mã dịch vụ "${dto.code}" đã tồn tại`);
      }
      throw err;
    }
  }

  async updateService(
    id: string,
    dto: {
      name?: string;
      nameEn?: string;
      description?: string;
      colorHex?: string;
      prefix?: string;
      isActive?: boolean;
    },
  ) {
    const exists = await this.prisma.queueService.findUnique({ where: { id } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Queue service ${id} not found`);
    return this.prisma.queueService.update({ where: { id }, data: dto });
  }

  async deleteService(id: string) {
    const exists = await this.prisma.queueService.findUnique({ where: { id } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Queue service ${id} not found`);
    // Soft-delete the service and all its counters
    await this.prisma.counter.updateMany({
      where: { serviceId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return this.prisma.queueService.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ──────────────────────────────────────────────────
  // COUNTER CRUD (CMS)
  // ──────────────────────────────────────────────────

  async createCounter(serviceId: string, dto: { number: string; name?: string }) {
    const exists = await this.prisma.queueService.findUnique({ where: { id: serviceId } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Queue service ${serviceId} not found`);
    return this.prisma.counter.create({
      data: {
        serviceId,
        number: dto.number,
        name: dto.name ?? `Quầy ${dto.number}`,
        status: CounterStatus.CLOSED,
      },
    });
  }

  async deleteCounter(counterId: string) {
    const exists = await this.prisma.counter.findUnique({ where: { id: counterId } });
    if (!exists || exists.deletedAt) throw new NotFoundException(`Counter ${counterId} not found`);
    return this.prisma.counter.update({
      where: { id: counterId },
      data: { deletedAt: new Date() },
    });
  }

  // ──────────────────────────────────────────────────
  // SEED (idempotent)
  // ──────────────────────────────────────────────────

  async seedServices() {
    const existing = await this.prisma.queueService.count({ where: { deletedAt: null } });
    if (existing > 0) {
      return { seeded: false, message: 'Queue services already exist', count: existing };
    }

    const DEFAULTS = [
      {
        code: 'HOT', name: 'Hộ tịch', prefix: 'A',
        colorHex: '#0068B7',
        description: 'Đăng ký khai sinh, kết hôn, khai tử, cấp bản sao hộ tịch',
      },
      {
        code: 'DAT', name: 'Đất đai', prefix: 'B',
        colorHex: '#0891B2',
        description: 'Cấp GCNQSD đất, chuyển nhượng, thế chấp quyền sử dụng đất',
      },
      {
        code: 'CCC', name: 'CCCD', prefix: 'C',
        colorHex: '#EA580C',
        description: 'Làm mới, gia hạn, đổi CCCD / CMND',
      },
      {
        code: 'CTH', name: 'Chứng thực', prefix: 'D',
        colorHex: '#16A34A',
        description: 'Chứng thực bản sao, chứng thực chữ ký, hợp đồng',
      },
    ];

    let created = 0;
    for (const svc of DEFAULTS) {
      const service = await this.prisma.queueService.create({ data: svc });
      await this.prisma.counter.createMany({
        data: [
          { serviceId: service.id, number: '01', name: 'Quầy 1', status: CounterStatus.OPEN  },
          { serviceId: service.id, number: '02', name: 'Quầy 2', status: CounterStatus.CLOSED },
        ],
      });
      created++;
    }

    this.gateway.broadcast('queue:seeded', { count: created });
    return { seeded: true, message: 'Default queue services created', count: created };
  }
}
