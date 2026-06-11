import { Injectable, Logger } from '@nestjs/common';
import { JobStatus, AIJobType, MessageRole } from '@prisma/client';
import { PrismaService } from '../../prisma.service';
import { AiRunnerService } from './ai-runner.service';
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
  type: 'OPEN_PROCEDURE' | 'VIEW_REQUIREMENTS' | 'SEARCH_PROCEDURE'
      | 'START_COPYDOC' | 'ASK_CLARIFY' | 'HUMAN_HELP';
  label: string;
  procedure_id?: string;
}

@Injectable()
export class AiGatewayService {
  private readonly logger = new Logger('AiGateway');

  constructor(
    private prisma: PrismaService,
    private runners: AiRunnerService,
    private workflow: WorkflowLaunchService,
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
    const conversationId = await this.resolveConversation(dto.kioskSessionId, dto.citizenId, language);

    // Persist the citizen message (best-effort)
    await this.saveMessage(conversationId, MessageRole.USER, dto.message, 'text');

    // Create a tracking job
    const job = await this.createJob(dto.kioskSessionId, conversationId, dto.message);

    try {
      const result = await this.process(dto.message, language);
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
        message: 'Xin lỗi, tôi chưa thể xử lý yêu cầu lúc này. Bạn có thể thử lại hoặc tra cứu thủ tục.',
        intent: 'UNKNOWN', confidence: 0,
        procedure: null,
        actions: [
          { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục' },
          { type: 'HUMAN_HELP', label: 'Nhờ nhân viên hỗ trợ' },
        ] as AiAction[],
        ui: { cards: [], voice: true },
      };
    }
  }

  /* ── Core processing: intent → procedure → actions ─── */
  private async process(message: string, language: string) {
    const norm = normalizeVi(message);

    // 1. Deterministic procedure mapping
    const matched = await this.matchProcedure(norm);

    // Sao y → CopyDoc service (handled by a dedicated kiosk flow)
    if (matched === '__COPYDOC__') {
      return {
        message: 'Tôi đã tìm thấy dịch vụ Sao y chứng thực bạn cần.',
        intent: 'COPY_DOCUMENT', confidence: 0.95,
        procedure: null,
        actions: [
          { type: 'START_COPYDOC', label: 'Bắt đầu sao y ngay' },
          { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục khác' },
        ] as AiAction[],
        ui: { cards: ['copydoc'], voice: true },
      };
    }

    if (matched && matched.procedure) {
      const p = matched.procedure;
      return {
        message: 'Tôi đã tìm thấy thủ tục phù hợp với yêu cầu của bạn.',
        intent: matched.intent, confidence: matched.confidence,
        procedure: {
          procedure_id: p.id,
          code: p.code,
          name: p.name,
          agency: p.processingAgency ?? null,
          slaWorkDays: p.slaWorkDays,
          requirements: p.requirements.map(r => r.documentName),
        },
        actions: [
          { type: 'OPEN_PROCEDURE',    label: 'Nộp hồ sơ ngay',          procedure_id: p.id },
          { type: 'VIEW_REQUIREMENTS', label: 'Xem hồ sơ cần chuẩn bị',  procedure_id: p.id },
          { type: 'SEARCH_PROCEDURE',  label: 'Tra cứu thủ tục' },
        ] as AiAction[],
        ui: { cards: ['procedure'], voice: true },
      };
    }

    // 2. No procedure → free-form guidance via a runner (QA), with fallback
    const answer = await this.runQa(message, language);
    return {
      message: answer ?? 'Tôi chưa rõ yêu cầu của bạn. Bạn muốn thực hiện thủ tục nào?',
      intent: 'QA_RESPONSE', confidence: answer ? 0.6 : 0.2,
      procedure: null,
      actions: [
        { type: 'SEARCH_PROCEDURE', label: 'Tra cứu thủ tục' },
        { type: 'HUMAN_HELP', label: 'Nhờ nhân viên hỗ trợ' },
      ] as AiAction[],
      ui: { cards: [], voice: true },
    };
  }

  /** Match the normalised phrase against active procedures + synonym seeds. */
  private async matchProcedure(norm: string) {
    // synonym hit first
    let target: string | null = null;
    for (const s of SYNONYMS) {
      if (s.keywords.some(k => norm.includes(k))) { target = s.match; break; }
    }
    if (target === '__COPYDOC__') return '__COPYDOC__' as const;

    const procedures = await this.prisma.procedure.findMany({
      where: { deletedAt: null, isActive: true },
      include: { category: true, requirements: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    let best: { procedure: (typeof procedures)[number]; intent: string; confidence: number } | null = null;
    let bestScore = 0;
    for (const p of procedures) {
      const hay = normalizeVi(`${p.name} ${p.code} ${p.category?.name ?? ''} ${p.description ?? ''}`);
      let score = 0;
      if (target && hay.includes(target)) score += 3;
      // word-overlap with the procedure name
      const nameWords = normalizeVi(p.name).split(' ').filter(w => w.length >= 3);
      const hits = nameWords.filter(w => norm.includes(w)).length;
      score += hits;
      if (score > bestScore) {
        bestScore = score;
        best = {
          procedure: p,
          intent: this.intentFor(p.category?.name),
          confidence: Math.min(0.95, 0.55 + score * 0.1),
        };
      }
    }
    return best;
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
  private async runQa(message: string, language: string): Promise<string | null> {
    const input: GenerateInput = {
      system: 'Bạn là trợ lý dịch vụ công thân thiện. Trả lời ngắn gọn bằng tiếng Việt, '
        + 'hướng dẫn công dân về thủ tục hành chính. Không dùng thuật ngữ kỹ thuật.',
      prompt: message,
      temperature: 0.3,
    };
    const tried: string[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      const runner = await this.runners.pickRunner('QA_RESPONSE', tried);
      if (!runner) return null; // no healthy runner — caller uses template
      tried.push(runner.id);
      await this.runners.incLoad(runner.id);
      try {
        const cfg = this.runners.toConfig(runner);
        const out = await getAdapter(runner.provider).generate(cfg, input);
        await this.runners.recordSuccess(runner.id, out.latencyMs);
        return (out.text || '').trim().slice(0, 800) || null;
      } catch (e: any) {
        this.logger.warn(`runner ${runner.name} failed: ${e?.message}`);
        await this.runners.recordFailure(runner.id);
      } finally {
        await this.runners.decLoad(runner.id);
      }
    }
    return null;
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
