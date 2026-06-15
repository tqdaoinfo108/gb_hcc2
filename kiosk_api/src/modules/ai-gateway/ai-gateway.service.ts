import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, AIJobType, MessageRole, ChatbotConfig } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AiRunnerService } from './ai-runner.service';
import { ChatbotConfigService } from './chatbot-config.service';
import { getAdapter, GenerateInput } from './ai-provider.adapter';
import { normalizeVi } from '../copy-doc/ocr-match.service';
import { WorkflowLaunchService } from '../workflow/workflow-launch.service';
import { ChatDto } from './ai-gateway.dto';

/** Phrase → procedure-code / category synonyms for deterministic mapping. */
const SYNONYMS: { keywords: string[]; match: string }[] = [
  { keywords: ['khai sinh', 'giay khai sinh'], match: 'khai sinh' },
  { keywords: ['ket hon', 'dang ky ket hon', 'dang ky k:et hon'], match: 'ket hon' },
  { keywords: ['khai tu', 'chung tu'], match: 'khai tu' },
  { keywords: ['ho khau', 'tam tru', 'thuong tru', 'cu tru'], match: 'cu tru' },
  { keywords: ['sao y', 'chung thuc', 'ban sao'], match: '__COPYDOC__' },
  { keywords: ['dat dai', 'so do', 'so hong', 'quyen su dung dat'], match: 'dat dai' },
  { keywords: ['kinh doanh', 'doanh nghiep', 'ho kinh doanh'], match: 'kinh doanh' },
];

export interface AiAction {
  type: 'OPEN_PROCEDURE' | 'START_WORKFLOW' | 'VIEW_REQUIREMENTS' | 'SEARCH_PROCEDURE'
      | 'START_COPYDOC' | 'ASK_CLARIFY' | 'HUMAN_HELP';
  label: string;
  procedure_id?: string;
  workflow_id?: string;
}

/** Structured procedure card returned to the kiosk (all data from CMS). */
export interface ProcedureCard {
  procedure_id: string;
  workflow_id: string | null;   // configured Selenium WorkflowTemplate id, null = no online flow
  code: string;
  name: string;
  description: string | null;
  agency: string | null;
  processingTime: string;       // e.g. "5 ngày làm việc"
  fee: string;                  // e.g. "Miễn phí" or "50.000 đồng"
  documents: { name: string; required: boolean; note?: string }[];
  notes: string | null;
  online: boolean;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger('AiGateway');

  constructor(
    private prisma: PrismaService,
    private runners: AiRunnerService,
    private workflow: WorkflowLaunchService,
    private chatbotConfig: ChatbotConfigService,
  ) {}

  /**
   * Execute an action chip. OPEN_PROCEDURE converges into the SAME workflow
   * launch pipeline the Manual flow uses — no separate submission path.
   */
  async executeAction(dto: {
    type: string; procedureId?: string;
    kioskSessionId: string; citizenId?: string; deviceSerial?: string;
  }) {
    switch (dto.type) {
      case 'OPEN_PROCEDURE':
      case 'START_WORKFLOW':
        if (!dto.procedureId) return { ok: false, message: 'Thiếu thủ tục.' };
        return this.workflow.launch({
          kioskSessionId: dto.kioskSessionId,
          procedureId: dto.procedureId,
          citizenId: dto.citizenId,
          deviceSerial: dto.deviceSerial,
          source: 'AI',
        });
      case 'VIEW_REQUIREMENTS':
        return dto.procedureId
          ? this.workflow.resolve(dto.procedureId)
          : { ok: false, message: 'Thiếu thủ tục.' };
      case 'START_COPYDOC':
        return { ok: true, redirect: 'COPYDOC' };
      default:
        return { ok: false, message: 'Hành động không được hỗ trợ.' };
    }
  }

  /* ── Public: citizen chat ──────────────────────────── */
  async chat(dto: ChatDto) {
    const language = dto.language ?? 'vi';
    const cfg = await this.chatbotConfig.resolve(dto.locationId ?? null);
    const conversationId = await this.resolveConversation(dto.kioskSessionId, dto.citizenId, language);

    // Persist the citizen message (best-effort)
    await this.saveMessage(conversationId, MessageRole.USER, dto.message, 'text');

    // Chatbot disabled by admin → polite hand-off, no AI call.
    if (!cfg.enabled) {
      const msg = cfg.fallbackMessage ?? 'Trợ lý ảo hiện đang tạm ngưng. Quý khách vui lòng nhờ cán bộ tại quầy hỗ trợ.';
      await this.saveMessage(conversationId, MessageRole.ASSISTANT, msg, 'text', 'DISABLED', 0);
      return {
        conversationId, message: msg, intent: 'DISABLED', confidence: 0, procedure: null, procedures: [] as ProcedureCard[],
        actions: [
          { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục' },
          { type: 'HUMAN_HELP', label: 'Nhờ nhân viên hỗ trợ' },
        ] as AiAction[],
        ui: { cards: [], voice: true },
      };
    }

    // Create a tracking job
    const job = await this.createJob(dto.kioskSessionId, conversationId, dto.message);

    try {
      const result = await this.process(dto.message, language, cfg);
      await this.completeJob(job?.id, result);
      await this.saveMessage(conversationId, MessageRole.ASSISTANT, result.message, 'text', result.intent, result.confidence);
      if (result.procedure) {
        await this.saveRecommendation(conversationId, result.procedure.procedure_id, result.procedure.name, result.confidence);
      }
      return { conversationId, ...result };
    } catch (e: any) {
      this.logger.error(`chat failed: ${e?.message}`);
      await this.failJob(job?.id, e?.message);
      // Citizen-friendly fallback — never expose internals
      return {
        conversationId,
        message: cfg.fallbackMessage ?? 'Xin lỗi, tôi chưa thể xử lý yêu cầu lúc này. Bạn có thể thử lại hoặc tra cứu thủ tục.',
        intent: 'UNKNOWN', confidence: 0,
        procedure: null, procedures: [] as ProcedureCard[],
        actions: [
          { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục' },
          { type: 'HUMAN_HELP', label: 'Nhờ nhân viên hỗ trợ' },
        ] as AiAction[],
        ui: { cards: [], voice: true },
      };
    }
  }

  /* ── Core processing: intent → procedure → actions ─── */
  private async process(message: string, language: string, cfg: ChatbotConfig) {
    const norm = normalizeVi(message);
    const target = this.synonymTarget(norm);

    // Sao y → CopyDoc service (handled by a dedicated kiosk flow)
    if (target === '__COPYDOC__') {
      return {
        message: 'Tôi đã tìm thấy dịch vụ Sao y chứng thực quý khách cần.',
        intent: 'COPY_DOCUMENT', confidence: 0.95,
        procedure: null, procedures: [] as ProcedureCard[],
        actions: [
          { type: 'START_COPYDOC', label: 'Bắt đầu sao y ngay' },
          { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục khác' },
        ] as AiAction[],
        ui: { cards: ['copydoc'], voice: true },
      };
    }

    // 1. Match against the CMS procedure catalog (ranked, multi-result).
    const matches = await this.matchProcedures(norm, target, 3);
    const strong = matches.filter(m => m.score >= 2);

    if (strong.length > 0) {
      const cards = await this.buildProcedureCards(strong.map(m => m.procedure));
      const top = strong[0];
      const single = cards.length === 1;
      const primary = cards[0];

      // Build the message. Single match → a full, detailed guide (LLM-enriched,
      // grounded strictly in CMS data so it lists EVERY required document).
      const reply = single
        ? await this.detailedAnswer(primary, message, cfg)
        : `Tôi tìm thấy ${cards.length} thủ tục có thể phù hợp. Quý khách chọn thủ tục cần thực hiện bên dưới.`;

      // Always offer a clear "submit" chip for the matched procedure.
      const actions: AiAction[] = [
        { type: 'START_WORKFLOW', label: 'Tôi muốn nộp hồ sơ', procedure_id: primary.procedure_id, workflow_id: primary.workflow_id ?? undefined },
        { type: 'VIEW_REQUIREMENTS', label: 'Xem lại giấy tờ cần chuẩn bị', procedure_id: primary.procedure_id },
        { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục khác' },
      ];

      return {
        message: reply,
        intent: top.intent,
        confidence: top.confidence,
        // Minimal singular shape kept for back-compat (saveRecommendation).
        procedure: { procedure_id: primary.procedure_id, name: primary.name },
        procedures: cards,
        actions,
        ui: { cards: ['procedure'], voice: true },
      };
    }

    // 2. No catalog match → free-form guidance via a runner (QA), with fallback.
    const answer = await this.runQa(message, language, cfg);
    return {
      message: answer ?? cfg.fallbackMessage ?? 'Tôi chưa rõ yêu cầu của quý khách. Quý khách muốn đăng ký mới hay cấp lại giấy tờ?',
      intent: 'QA_RESPONSE', confidence: answer ? 0.6 : 0.2,
      procedure: null, procedures: [] as ProcedureCard[],
      actions: [
        { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục' },
        { type: 'HUMAN_HELP', label: 'Nhờ nhân viên hỗ trợ' },
      ] as AiAction[],
      ui: { cards: [], voice: true },
    };
  }

  /** First synonym group whose keyword appears in the phrase (or null). */
  private synonymTarget(norm: string): string | null {
    for (const s of SYNONYMS) {
      if (s.keywords.some(k => norm.includes(k))) return s.match;
    }
    return null;
  }

  /** Rank active procedures against the phrase; returns the top `limit` with score. */
  private async matchProcedures(norm: string, target: string | null, limit: number) {
    const procedures = await this.prisma.procedure.findMany({
      where: { deletedAt: null, isActive: true },
      include: { category: true, requirements: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    const scored = procedures.map((p) => {
      const hay = normalizeVi(`${p.name} ${p.code} ${p.category?.name ?? ''} ${p.description ?? ''}`);
      let score = 0;
      if (target && target !== '__COPYDOC__' && hay.includes(target)) score += 3;
      const nameWords = normalizeVi(p.name).split(' ').filter(w => w.length >= 3);
      score += nameWords.filter(w => norm.includes(w)).length;
      return {
        procedure: p,
        intent: this.intentFor(p.category?.name),
        confidence: Math.min(0.95, 0.55 + score * 0.1),
        score,
      };
    }).filter(m => m.score > 0);

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  }

  /** Shape matched procedures into structured cards, resolving online workflow ids. */
  private async buildProcedureCards(
    procedures: { id: string; code: string; name: string; description: string | null; processingAgency: string | null; slaWorkDays: number; fee: unknown; feeNote: string | null; legalBasis: string | null; isOnline: boolean; requirements: { documentName: string; isRequired: boolean; description: string | null }[] }[],
  ): Promise<ProcedureCard[]> {
    const ids = procedures.map(p => p.id);
    const templates = await this.prisma.workflowTemplate.findMany({
      where: { procedureId: { in: ids }, isActive: true, isPublished: true, deletedAt: null },
      select: { id: true, procedureId: true },
    });
    const tmplByProc = new Map(templates.map(t => [t.procedureId, t.id] as const));

    return procedures.map((p) => {
      const wf = tmplByProc.get(p.id) ?? null;
      return {
        procedure_id: p.id,
        workflow_id: wf,
        code: p.code,
        name: p.name,
        description: p.description,
        agency: p.processingAgency,
        processingTime: `${p.slaWorkDays} ngày làm việc`,
        fee: this.formatFee(p.fee, p.feeNote),
        documents: p.requirements.map(r => ({ name: r.documentName, required: r.isRequired, note: r.description ?? undefined })),
        notes: p.legalBasis,
        online: !!wf && p.isOnline,
      };
    });
  }

  private formatFee(fee: unknown, note: string | null): string {
    const n = fee == null ? 0 : Number(fee);
    if (!n || Number.isNaN(n)) return note?.trim() || 'Miễn phí';
    const formatted = `${n.toLocaleString('vi-VN')} đồng`;
    return note?.trim() ? `${formatted} (${note.trim()})` : formatted;
  }

  /** Official facts block (grounding for the LLM — never invent beyond this). */
  private buildFacts(c: ProcedureCard): string {
    const docs = c.documents.length
      ? c.documents.map((d, i) => `${i + 1}. ${d.name}${d.required ? '' : ' (không bắt buộc)'}${d.note ? ` — ${d.note}` : ''}`).join('\n')
      : '(chưa có dữ liệu giấy tờ)';
    return [
      `Tên thủ tục: ${c.name}`,
      c.description ? `Mô tả: ${c.description}` : '',
      `Giấy tờ cần chuẩn bị:\n${docs}`,
      `Thời gian xử lý: ${c.processingTime}`,
      `Lệ phí: ${c.fee}`,
      c.agency ? `Cơ quan tiếp nhận: ${c.agency}` : '',
      c.notes ? `Căn cứ pháp lý: ${c.notes}` : '',
      `Nộp trực tuyến: ${c.online ? 'Có' : 'Không (nộp tại quầy)'}`,
    ].filter(Boolean).join('\n');
  }

  /** Detailed answer from CMS data only (used when no AI runner is available). */
  private deterministicAnswer(c: ProcedureCard): string {
    const docs = c.documents.length
      ? c.documents.map(d => `• ${d.name}${d.required ? '' : ' (không bắt buộc)'}${d.note ? ` — ${d.note}` : ''}`).join('\n')
      : '• (Quý khách vui lòng liên hệ cán bộ tại quầy để được hướng dẫn giấy tờ.)';
    return [
      `Để thực hiện thủ tục «${c.name}», quý khách cần chuẩn bị các giấy tờ sau:`,
      docs,
      '',
      `Thời gian xử lý: ${c.processingTime}. Lệ phí: ${c.fee}.${c.agency ? ` Nơi nộp: ${c.agency}.` : ''}`,
      `Quý khách có muốn nộp hồ sơ${c.online ? ' trực tuyến' : ''} ngay bây giờ không ạ?`,
    ].join('\n');
  }

  /**
   * Compose a detailed, citizen-friendly guide. Prefers an LLM rewrite grounded
   * strictly in the procedure's CMS data (so it reads like a thorough answer yet
   * never invents documents); falls back to the deterministic list if no runner.
   */
  private async detailedAnswer(c: ProcedureCard, question: string, cfg: ChatbotConfig): Promise<string> {
    const facts = this.buildFacts(c);
    const prompt =
      `THÔNG TIN CHÍNH THỨC VỀ THỦ TỤC (chỉ được dùng đúng thông tin này, KHÔNG bịa thêm giấy tờ nào khác):\n${facts}\n\n` +
      `Câu hỏi của người dân: "${question}"\n\n` +
      `Hãy viết câu trả lời chi tiết, rõ ràng, thân thiện bằng tiếng Việt:\n` +
      `- LIỆT KÊ ĐẦY ĐỦ tất cả giấy tờ cần chuẩn bị (gạch đầu dòng), ghi rõ giấy nào bắt buộc.\n` +
      `- Nêu thời gian xử lý, lệ phí và nơi nộp.\n` +
      `- Kết thúc bằng một câu mời người dân nộp hồ sơ.`;
    const input: GenerateInput = {
      system: cfg.systemPrompt,
      prompt,
      temperature: Math.min(cfg.temperature, 0.4),
      maxTokens: Math.max(cfg.maxTokens, 700),
    };
    const tried: string[] = [];
    for (let attempt = 0; attempt < 2; attempt++) {
      const runner = await this.pickPreferredRunner(cfg.primaryRunnerId, tried);
      if (!runner) break;
      tried.push(runner.id);
      await this.runners.incLoad(runner.id);
      try {
        const out = await getAdapter(runner.provider).generate(this.runners.toConfig(runner), input);
        await this.runners.recordSuccess(runner.id, out.latencyMs);
        const text = (out.text || '').trim();
        if (text) return text;
      } catch (e: any) {
        this.logger.warn(`detailedAnswer runner failed: ${e?.message}`);
        await this.runners.recordFailure(runner.id);
      } finally {
        await this.runners.decLoad(runner.id);
      }
    }
    return this.deterministicAnswer(c);
  }

  /* ── AI usage report (CMS dashboard) ───────────────── */
  async usageReport(days = 30) {
    const safeDays = Math.max(1, Math.min(365, days || 30));
    const since = new Date(Date.now() - safeDays * 86_400_000);

    const [convRows, msgTotal, userMsgs, asstMsgs, asstConf, intentGroups, recGroups, jobGroups, jobAgg, recTotal, recAccepted, runners] =
      await Promise.all([
        this.prisma.aIConversation.findMany({ where: { createdAt: { gte: since }, deletedAt: null }, select: { createdAt: true } }),
        this.prisma.aIMessage.count({ where: { createdAt: { gte: since } } }),
        this.prisma.aIMessage.count({ where: { createdAt: { gte: since }, role: MessageRole.USER } }),
        this.prisma.aIMessage.count({ where: { createdAt: { gte: since }, role: MessageRole.ASSISTANT } }),
        this.prisma.aIMessage.aggregate({ where: { createdAt: { gte: since }, role: MessageRole.ASSISTANT, confidence: { not: null } }, _avg: { confidence: true } }),
        this.prisma.aIMessage.groupBy({ by: ['intent'], where: { createdAt: { gte: since }, role: MessageRole.ASSISTANT, intent: { not: null } }, _count: { _all: true } }),
        this.prisma.aIRecommendation.groupBy({ by: ['title'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
        this.prisma.aIJob.groupBy({ by: ['status'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
        this.prisma.aIJob.aggregate({ where: { createdAt: { gte: since }, responseTimeMs: { not: null } }, _avg: { responseTimeMs: true } }),
        this.prisma.aIRecommendation.count({ where: { createdAt: { gte: since } } }),
        this.prisma.aIRecommendation.count({ where: { createdAt: { gte: since }, wasAccepted: true } }),
        this.prisma.aiRunner.findMany({ where: { deletedAt: null }, select: { name: true, provider: true, health: true, latencyMs: true, failureRate: true, status: true }, orderBy: { priority: 'asc' } }),
      ]);

    // Daily conversation buckets for the last `safeDays` days.
    const buckets = new Map<string, number>();
    for (let i = safeDays - 1; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86_400_000);
      buckets.set(d.toISOString().slice(0, 10), 0);
    }
    for (const c of convRows) {
      const key = c.createdAt.toISOString().slice(0, 10);
      if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
    }

    return {
      rangeDays: safeDays,
      conversations: convRows.length,
      messages: { total: msgTotal, user: userMsgs, assistant: asstMsgs },
      avgConfidence: asstConf._avg.confidence ?? null,
      intents: intentGroups.map(g => ({ intent: g.intent ?? 'UNKNOWN', count: g._count._all })).sort((a, b) => b.count - a.count).slice(0, 10),
      topProcedures: recGroups.map(g => ({ title: g.title, count: g._count._all })).sort((a, b) => b.count - a.count).slice(0, 10),
      jobs: {
        byStatus: Object.fromEntries(jobGroups.map(g => [g.status, g._count._all])),
        avgResponseMs: jobAgg._avg.responseTimeMs ?? null,
      },
      recommendations: { total: recTotal, accepted: recAccepted },
      runners,
      daily: Array.from(buckets.entries()).map(([date, count]) => ({ date, count })),
    };
  }

  private intentFor(categoryName?: string | null): string {
    const c = normalizeVi(categoryName ?? '');
    if (c.includes('khai sinh') || c.includes('ho tich')) return 'REGISTER_BIRTH';
    if (c.includes('ket hon')) return 'REGISTER_MARRIAGE';
    if (c.includes('cu tru')) return 'RESIDENCE';
    if (c.includes('dat')) return 'LAND';
    return 'PROCEDURE_MATCH';
  }

  /* ── Runner-backed QA with router + fallback ───────── */
  private async runQa(message: string, language: string, cfg: ChatbotConfig): Promise<string | null> {
    let system = cfg.systemPrompt;
    if (cfg.includeProcedureContext) {
      const catalog = await this.procedureCatalogText();
      if (catalog) {
        system += `\n\nDANH MỤC THỦ TỤC ĐANG CUNG CẤP (dùng để tư vấn đúng, không bịa thêm):\n${catalog}`;
      }
    }
    const input: GenerateInput = {
      system,
      prompt: message,
      temperature: cfg.temperature,
      maxTokens: cfg.maxTokens,
    };
    const tried: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const runner = await this.pickPreferredRunner(cfg.primaryRunnerId, tried);
      if (!runner) return null; // no healthy runner — caller uses template
      tried.push(runner.id);
      await this.runners.incLoad(runner.id);
      try {
        const rcfg = this.runners.toConfig(runner);
        const out = await getAdapter(runner.provider).generate(rcfg, input);
        await this.runners.recordSuccess(runner.id, out.latencyMs);
        return (out.text || '').trim().slice(0, 2000) || null;
      } catch (e: any) {
        this.logger.warn(`runner ${runner.name} failed: ${e?.message}`);
        await this.runners.recordFailure(runner.id);
      } finally {
        await this.runners.decLoad(runner.id);
      }
    }
    return null;
  }

  /** Prefer the admin-selected runner (if usable), otherwise fall back to the router. */
  private async pickPreferredRunner(primaryId: string | null, tried: string[]) {
    if (primaryId && !tried.includes(primaryId)) {
      const r = await this.prisma.aiRunner.findFirst({
        where: { id: primaryId, deletedAt: null, status: 'ENABLED', health: { not: 'UNHEALTHY' } },
      });
      if (r && r.activeJobs < r.maxConcurrent) return r;
    }
    return this.runners.pickRunner('QA_RESPONSE', tried);
  }

  /** Compact catalogue of active procedures to ground the model's guidance. */
  private async procedureCatalogText(limit = 40): Promise<string> {
    try {
      const procs = await this.prisma.procedure.findMany({
        where: { deletedAt: null, isActive: true },
        select: { name: true, category: { select: { name: true } } },
        take: limit,
        orderBy: { name: 'asc' },
      });
      return procs.map(p => `- ${p.name}${p.category?.name ? ` (${p.category.name})` : ''}`).join('\n');
    } catch {
      return '';
    }
  }

  /* ── Persistence helpers (best-effort) ─────────────── */
  private async resolveConversation(sessionId: string, citizenId: string | undefined, language: string): Promise<string> {
    try {
      const existing = await this.prisma.aIConversation.findFirst({
        where: { sessionId, endedAt: null, deletedAt: null },
        orderBy: { startedAt: 'desc' },
      });
      if (existing) return existing.id;
      const created = await this.prisma.aIConversation.create({
        data: { sessionId, citizenId: citizenId ?? null, language },
      });
      return created.id;
    } catch {
      // Session row may not exist in dev — return a synthetic id (no persistence)
      return `ephemeral:${sessionId}`;
    }
  }

  private async saveMessage(
    conversationId: string, role: MessageRole, content: string,
    inputType?: string, intent?: string, confidence?: number,
  ) {
    if (conversationId.startsWith('ephemeral:')) return;
    try {
      await this.prisma.aIMessage.create({
        data: { conversationId, role, content, inputType, intent, confidence },
      });
    } catch (e: any) { this.logger.debug(`saveMessage skipped: ${e?.message}`); }
  }

  private async saveRecommendation(conversationId: string, procedureId: string, title: string, confidence: number) {
    if (conversationId.startsWith('ephemeral:')) return;
    try {
      await this.prisma.aIRecommendation.create({
        data: { conversationId, procedureId, title, confidence },
      });
    } catch (e: any) { this.logger.debug(`saveRecommendation skipped: ${e?.message}`); }
  }

  private async createJob(sessionId: string, conversationId: string, message: string) {
    try {
      return await this.prisma.aIJob.create({
        data: {
          sessionId,
          conversationId: conversationId.startsWith('ephemeral:') ? null : conversationId,
          jobType: AIJobType.INTENT_DETECTION,
          status: JobStatus.RUNNING,
          inputPayload: { message },
          startedAt: new Date(),
        },
      });
    } catch { return null; }
  }

  private async completeJob(jobId: string | undefined, result: unknown) {
    if (!jobId) return;
    try {
      await this.prisma.aIJob.update({
        where: { id: jobId },
        data: { status: JobStatus.COMPLETED, outputPayload: result as any, completedAt: new Date() },
      });
    } catch { /* ignore */ }
  }

  private async failJob(jobId: string | undefined, reason?: string) {
    if (!jobId) return;
    try {
      await this.prisma.aIJob.update({
        where: { id: jobId },
        data: { status: JobStatus.FAILED, failReason: reason?.slice(0, 300), completedAt: new Date() },
      });
    } catch { /* ignore */ }
  }
}
