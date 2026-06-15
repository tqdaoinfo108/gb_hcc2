import { Injectable } from '@nestjs/common';
import { ChatbotConfig } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { UpdateChatbotConfigDto } from './ai-gateway.dto';

/** Detailed default system prompt: a friendly Vietnamese public-service assistant
 *  that guides citizens step-by-step through administrative procedures. */
const DEFAULT_SYSTEM_PROMPT = `Bạn là Trợ lý ảo của Trung tâm Hành chính công, hỗ trợ người dân thực hiện thủ tục hành chính.

NHIỆM VỤ:
- Hướng dẫn người dân từng bước, rõ ràng, dễ hiểu về thủ tục hành chính họ cần.
- Khi người dân hỏi về một thủ tục, hãy nêu: hồ sơ/giấy tờ cần chuẩn bị, trình tự nộp, lệ phí (nếu biết), thời gian xử lý và cơ quan tiếp nhận.
- Nếu chưa rõ người dân cần gì, hãy hỏi lại một câu ngắn gọn để làm rõ.

PHONG CÁCH:
- Trả lời bằng tiếng Việt, lịch sự, thân thiện, ngắn gọn (tối đa 4-6 câu hoặc gạch đầu dòng).
- Tuyệt đối không dùng thuật ngữ kỹ thuật, không nhắc đến hệ thống, AI hay mô hình.
- Xưng "tôi", gọi người dân là "quý khách" hoặc "anh/chị".

GIỚI HẠN:
- Chỉ tư vấn về thủ tục hành chính công và dịch vụ tại trung tâm.
- Không bịa đặt thông tin. Nếu không chắc chắn, hãy khuyên người dân tra cứu thủ tục hoặc gặp cán bộ hỗ trợ tại quầy.
- Không thu thập thông tin cá nhân nhạy cảm (số CCCD, mật khẩu, tài khoản ngân hàng).`;

const DEFAULT_SUGGESTED = [
  'Tôi muốn đăng ký khai sinh cho con',
  'Thủ tục đăng ký kết hôn cần giấy tờ gì?',
  'Tôi cần sao y chứng thực giấy tờ',
  'Hướng dẫn đăng ký tạm trú',
];

const DEFAULT_WELCOME = 'Xin chào! Tôi là trợ lý ảo của Trung tâm Hành chính công. Quý khách cần hỗ trợ thủ tục gì ạ?';
const DEFAULT_FALLBACK = 'Xin lỗi, tôi chưa thể trả lời câu hỏi này. Quý khách vui lòng tra cứu thủ tục hoặc nhờ cán bộ tại quầy hỗ trợ.';

@Injectable()
export class ChatbotConfigService {
  constructor(private prisma: PrismaService) {}

  /** Locations for the CMS config dropdown. */
  listLocations() {
    return this.prisma.kioskLocation.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: 'asc' },
    });
  }

  /** The global (default) config, created with sensible defaults on first access. */
  async getGlobalOrCreate(): Promise<ChatbotConfig> {
    const g = await this.prisma.chatbotConfig.findFirst({ where: { locationId: null }, orderBy: { createdAt: 'asc' } });
    if (g) return g;
    return this.prisma.chatbotConfig.create({
      data: {
        locationId: null,
        enabled: true,
        systemPrompt: DEFAULT_SYSTEM_PROMPT,
        welcomeMessage: DEFAULT_WELCOME,
        fallbackMessage: DEFAULT_FALLBACK,
        temperature: 0.3,
        maxTokens: 512,
        suggestedQuestions: DEFAULT_SUGGESTED,
        includeProcedureContext: true,
      },
    });
  }

  /** Resolve the effective config for a location: its own override, else global. */
  async resolve(locationId: string | null): Promise<ChatbotConfig> {
    if (locationId) {
      const loc = await this.prisma.chatbotConfig.findUnique({ where: { locationId } });
      if (loc) return loc;
    }
    return this.getGlobalOrCreate();
  }

  /**
   * CMS edit view. For a location with no override yet, returns the inherited
   * global values with `id: null` + `inherited: true` (not persisted until saved).
   */
  async getForAdmin(locationId: string | null) {
    const global = await this.getGlobalOrCreate();
    if (!locationId) return { ...global, inherited: false };
    const loc = await this.prisma.chatbotConfig.findUnique({ where: { locationId } });
    if (loc) return { ...loc, inherited: false };
    return { ...global, id: null as string | null, locationId, inherited: true };
  }

  /** Lightweight public config for the kiosk chat UI (resolved for its location). */
  async getPublic(locationId: string | null) {
    const c = await this.resolve(locationId);
    return {
      enabled: c.enabled,
      welcomeMessage: c.welcomeMessage ?? DEFAULT_WELCOME,
      suggestedQuestions: c.suggestedQuestions,
    };
  }

  /** Save the config for a location (null = global). Creates a per-location row on first save. */
  async update(dto: UpdateChatbotConfigDto, locationId: string | null, actorName?: string) {
    const target = locationId
      ? await this.prisma.chatbotConfig.findUnique({ where: { locationId } })
      : await this.getGlobalOrCreate();

    const data = {
      enabled: dto.enabled,
      systemPrompt: dto.systemPrompt?.trim(),
      welcomeMessage: dto.welcomeMessage === undefined ? undefined : (dto.welcomeMessage?.trim() || null),
      fallbackMessage: dto.fallbackMessage === undefined ? undefined : (dto.fallbackMessage?.trim() || null),
      temperature: dto.temperature,
      maxTokens: dto.maxTokens,
      suggestedQuestions: dto.suggestedQuestions,
      includeProcedureContext: dto.includeProcedureContext,
      primaryRunnerId: dto.primaryRunnerId === undefined ? undefined : (dto.primaryRunnerId || null),
      updatedByName: actorName ?? undefined,
    };

    if (target) {
      return this.prisma.chatbotConfig.update({ where: { id: target.id }, data });
    }

    // First save for this location → create an override seeded from the global config.
    const base = await this.getGlobalOrCreate();
    return this.prisma.chatbotConfig.create({
      data: {
        locationId,
        enabled: dto.enabled ?? base.enabled,
        systemPrompt: dto.systemPrompt?.trim() || base.systemPrompt,
        welcomeMessage: dto.welcomeMessage === undefined ? base.welcomeMessage : (dto.welcomeMessage?.trim() || null),
        fallbackMessage: dto.fallbackMessage === undefined ? base.fallbackMessage : (dto.fallbackMessage?.trim() || null),
        temperature: dto.temperature ?? base.temperature,
        maxTokens: dto.maxTokens ?? base.maxTokens,
        suggestedQuestions: dto.suggestedQuestions ?? base.suggestedQuestions,
        includeProcedureContext: dto.includeProcedureContext ?? base.includeProcedureContext,
        primaryRunnerId: dto.primaryRunnerId === undefined ? base.primaryRunnerId : (dto.primaryRunnerId || null),
        updatedByName: actorName ?? undefined,
      },
    });
  }

  /** Remove a location override (revert to inheriting the global config). */
  async resetLocation(locationId: string) {
    const existing = await this.prisma.chatbotConfig.findUnique({ where: { locationId } });
    if (existing) await this.prisma.chatbotConfig.delete({ where: { id: existing.id } });
    return { ok: true };
  }
}
