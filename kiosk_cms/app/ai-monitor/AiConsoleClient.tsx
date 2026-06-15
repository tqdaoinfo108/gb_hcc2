"use client";

import { useCallback, useEffect, useState } from "react";
import { auditHeaders } from "../lib/audit-headers";
import { fmt } from "../components";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ── Types ─────────────────────────────────────────────── */
interface ChatbotConfig {
  id: string | null; locationId: string | null; inherited?: boolean;
  enabled: boolean; systemPrompt: string;
  welcomeMessage: string | null; fallbackMessage: string | null;
  temperature: number; maxTokens: number; suggestedQuestions: string[];
  includeProcedureContext: boolean; primaryRunnerId: string | null;
  updatedByName: string | null; updatedAt: string;
}
interface Location { id: string; name: string; code: string }
interface Runner {
  id: string; name: string; provider: string; endpoint: string; modelName: string;
  authKey: string | null; priority: number; timeoutMs: number; maxConcurrent: number;
  capabilities: string[]; status: string; health: string; latencyMs: number | null;
  failureRate: number; lastOkAt: string | null;
}
interface Conversation {
  id: string; sessionId: string; language: string;
  startedAt: string; endedAt: string | null; totalTokens: number | null;
  _count: { messages: number };
  messages: { content: string }[];
}

const PROVIDERS = [
  { value: "OPENAI_COMPAT", label: "OpenAI-compatible (NVIDIA, OpenRouter, vLLM…)" },
  { value: "GEMINI", label: "Google Gemini" },
  { value: "OLLAMA", label: "Ollama (máy chủ nội bộ)" },
  { value: "PRIVATE", label: "Nội bộ / khác (OpenAI-compatible)" },
];
const ALL_CAPS = ["QA_RESPONSE", "INTENT_DETECTION", "PROCEDURE_MATCH"];

/* ── API helper ────────────────────────────────────────── */
const H = () => ({ "Content-Type": "application/json", ...auditHeaders() });
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: H(), cache: "no-store", ...init });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

function healthTone(h: string): { bg: string; fg: string; label: string } {
  switch (h) {
    case "HEALTHY": return { bg: "#dcfce7", fg: "#15803d", label: "Khoẻ" };
    case "DEGRADED": return { bg: "#fef3c7", fg: "#b45309", label: "Chập chờn" };
    case "UNHEALTHY": return { bg: "#fee2e2", fg: "#b91c1c", label: "Lỗi" };
    default: return { bg: "#f1f5f9", fg: "#64748b", label: "Chưa rõ" };
  }
}

/* ═══════════════════════════════════════════════════════ */
export function AiConsoleClient({ initialConversations }: { initialConversations: Conversation[] }) {
  const [tab, setTab] = useState<"config" | "providers" | "reports" | "history">("config");
  const [config, setConfig] = useState<ChatbotConfig | null>(null);
  const [runners, setRunners] = useState<Runner[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [locId, setLocId] = useState<string>(""); // "" = global default
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };
  const qs = (id: string) => (id ? `?locationId=${encodeURIComponent(id)}` : "");
  const loadConfig = useCallback(() => api<ChatbotConfig>(`/ai/config${qs(locId)}`).then(setConfig).catch(() => {}), [locId]);
  const loadRunners = useCallback(() => api<Runner[]>("/ai-runners").then(setRunners).catch(() => {}), []);
  const loadLocations = useCallback(() => api<Location[]>("/ai/locations").then(setLocations).catch(() => {}), []);

  useEffect(() => { void loadConfig(); }, [loadConfig]);
  useEffect(() => { void loadRunners(); void loadLocations(); }, [loadRunners, loadLocations]);

  return (
    <div>
      {toast && (
        <div className="fixed right-6 top-6 z-50 max-w-md rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>
      )}

      <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["config", "Cấu hình Chatbot"], ["providers", "Nhà cung cấp AI"], ["reports", "Báo cáo"], ["history", "Hội thoại"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === k ? "bg-white text-[#0068B7] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {tab === "config" && (
        <ConfigPanel config={config} runners={runners} locations={locations}
          locId={locId} setLocId={setLocId} busy={busy} setBusy={setBusy}
          reload={loadConfig} showToast={showToast} />
      )}
      {tab === "providers" && (
        <ProvidersPanel runners={runners} busy={busy} setBusy={setBusy}
          reload={loadRunners} showToast={showToast} />
      )}
      {tab === "reports" && <ReportPanel showToast={showToast} />}
      {tab === "history" && <HistoryPanel conversations={initialConversations} />}
    </div>
  );
}

/* ── Tab: AI usage report ──────────────────────────────── */
interface UsageReport {
  rangeDays: number;
  conversations: number;
  messages: { total: number; user: number; assistant: number };
  avgConfidence: number | null;
  intents: { intent: string; count: number }[];
  topProcedures: { title: string; count: number }[];
  jobs: { byStatus: Record<string, number>; avgResponseMs: number | null };
  recommendations: { total: number; accepted: number };
  runners: { name: string; provider: string; health: string; latencyMs: number | null; failureRate: number; status: string }[];
  daily: { date: string; count: number }[];
}

function ReportPanel({ showToast }: { showToast: (m: string) => void }) {
  const [days, setDays] = useState(30);
  const [r, setR] = useState<UsageReport | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback((d: number) => {
    setLoading(true);
    api<UsageReport>(`/ai/reports?days=${d}`).then(setR).catch((e) => showToast(`Lỗi tải báo cáo: ${e instanceof Error ? e.message : e}`)).finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => { load(days); }, [load, days]);

  if (loading && !r) return <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">Đang tải báo cáo…</div>;
  if (!r) return null;

  const maxDaily = Math.max(1, ...r.daily.map(d => d.count));
  const Stat = ({ label, value, sub }: { label: string; value: string | number; sub?: string }) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="text-xs font-semibold text-slate-500">{label}</div>
      <div className="mt-1 text-2xl font-black text-slate-900">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">Thống kê {r.rangeDays} ngày gần nhất</p>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {[7, 30, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${days === d ? "bg-white text-[#0068B7] shadow-sm" : "text-slate-500"}`}>{d} ngày</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Cuộc hội thoại" value={r.conversations.toLocaleString("vi-VN")} />
        <Stat label="Tin nhắn" value={r.messages.total.toLocaleString("vi-VN")} sub={`${r.messages.user} hỏi · ${r.messages.assistant} trả lời`} />
        <Stat label="Độ tin cậy TB" value={r.avgConfidence != null ? `${Math.round(r.avgConfidence * 100)}%` : "—"} />
        <Stat label="Gợi ý thủ tục" value={r.recommendations.total.toLocaleString("vi-VN")} sub={`${r.recommendations.accepted} được chọn`} />
      </div>

      {/* Daily conversations bar chart */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-bold text-slate-700">Hội thoại theo ngày</div>
        <div className="flex h-32 items-end gap-1">
          {r.daily.map(d => (
            <div key={d.date} className="flex flex-1 flex-col items-center justify-end" title={`${d.date}: ${d.count}`}>
              <div className="w-full rounded-t bg-[#0068B7]/80" style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: d.count > 0 ? 3 : 0 }} />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Intents */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-bold text-slate-700">Ý định phổ biến</div>
          {r.intents.length === 0 ? <p className="text-xs text-slate-400">Chưa có dữ liệu.</p> : r.intents.map(it => {
            const max = Math.max(1, ...r.intents.map(x => x.count));
            return (
              <div key={it.intent} className="mb-2">
                <div className="flex justify-between text-xs text-slate-600"><span className="font-mono">{it.intent}</span><b>{it.count}</b></div>
                <div className="mt-0.5 h-1.5 rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#0068B7]" style={{ width: `${(it.count / max) * 100}%` }} /></div>
              </div>
            );
          })}
        </div>
        {/* Top procedures */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 text-sm font-bold text-slate-700">Thủ tục được gợi ý nhiều</div>
          {r.topProcedures.length === 0 ? <p className="text-xs text-slate-400">Chưa có dữ liệu.</p> : r.topProcedures.map((p, i) => (
            <div key={i} className="flex justify-between border-b border-slate-50 py-1.5 text-sm last:border-0">
              <span className="truncate text-slate-700">{p.title}</span><b className="text-slate-500">{p.count}</b>
            </div>
          ))}
        </div>
      </div>

      {/* Provider health */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 text-sm font-bold text-slate-700">Nhà cung cấp AI {r.jobs.avgResponseMs != null && <span className="font-normal text-slate-400">· phản hồi TB {Math.round(r.jobs.avgResponseMs)}ms</span>}</div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {r.runners.map((rn, i) => {
            const tone = healthTone(rn.health);
            return (
              <div key={i} className="flex items-center justify-between rounded-xl border border-slate-100 px-3 py-2">
                <div className="min-w-0"><div className="truncate text-sm font-semibold text-slate-800">{rn.name}</div><div className="text-[11px] text-slate-400">{rn.provider} · {rn.latencyMs ? `${Math.round(rn.latencyMs)}ms` : "—"}</div></div>
                <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ── Tab 1: Chatbot config ─────────────────────────────── */
function ConfigPanel({
  config, runners, locations, locId, setLocId, busy, setBusy, reload, showToast,
}: {
  config: ChatbotConfig | null; runners: Runner[]; locations: Location[];
  locId: string; setLocId: (s: string) => void; busy: string | null;
  setBusy: (s: string | null) => void; reload: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [f, setF] = useState<ChatbotConfig | null>(config);
  const [questionsText, setQuestionsText] = useState("");
  const [testMsg, setTestMsg] = useState("");
  const [testReply, setTestReply] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const qs = locId ? `?locationId=${encodeURIComponent(locId)}` : "";

  useEffect(() => {
    setF(config);
    setQuestionsText(config?.suggestedQuestions.join("\n") ?? "");
  }, [config]);

  if (!f) return <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">Đang tải cấu hình…</div>;

  const save = async () => {
    setBusy("save-config");
    try {
      const suggestedQuestions = questionsText.split("\n").map(s => s.trim()).filter(Boolean);
      await api(`/ai/config${qs}`, { method: "PUT", body: JSON.stringify({
        enabled: f.enabled, systemPrompt: f.systemPrompt,
        welcomeMessage: f.welcomeMessage, fallbackMessage: f.fallbackMessage,
        temperature: f.temperature, maxTokens: f.maxTokens,
        suggestedQuestions, includeProcedureContext: f.includeProcedureContext,
        primaryRunnerId: f.primaryRunnerId,
      }) });
      showToast(locId ? "Đã lưu cấu hình cho địa điểm" : "Đã lưu cấu hình mặc định");
      await reload();
    } catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };

  const resetToDefault = async () => {
    if (!locId) return;
    if (!confirm("Xoá cấu hình riêng của địa điểm này và dùng lại cấu hình mặc định?")) return;
    setBusy("reset-config");
    try {
      await api(`/ai/config${qs}`, { method: "DELETE" });
      showToast("Đã khôi phục cấu hình mặc định cho địa điểm");
      await reload();
    } catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };

  const runTest = async () => {
    if (!testMsg.trim()) return;
    setTesting(true); setTestReply(null);
    try {
      const r = await api<{ message: string }>("/ai/chat", { method: "POST", body: JSON.stringify({
        kioskSessionId: "cms-test", message: testMsg.trim(), locationId: locId || undefined,
      }) });
      setTestReply(r.message);
    } catch (e) { setTestReply(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setTesting(false); }
  };

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_360px]">
      {/* Left: form */}
      <div className="space-y-4">
        {/* Location selector */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-sm font-bold text-slate-700">Áp dụng cho địa điểm</label>
          <p className="mb-2 text-xs text-slate-500">Chọn “Mặc định” để cấu hình dùng chung; chọn một địa điểm để tạo cấu hình riêng cho địa điểm đó.</p>
          <div className="flex flex-wrap items-center gap-3">
            <select value={locId} onChange={(e) => setLocId(e.target.value)}
              className="min-w-[260px] rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none">
              <option value="">Mặc định (mọi địa điểm)</option>
              {locations.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
            {locId !== "" && (
              f.inherited
                ? <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">Đang kế thừa cấu hình mặc định — lưu để tạo riêng</span>
                : <button onClick={resetToDefault} disabled={busy === "reset-config"}
                    className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                    {busy === "reset-config" ? "Đang xoá…" : "Dùng lại cấu hình mặc định"}
                  </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-black text-slate-900">Trạng thái trợ lý</h3>
              <p className="text-sm text-slate-500">Bật/tắt trợ lý ảo cho người dân tại kiosk.</p>
            </div>
            <button onClick={() => setF({ ...f, enabled: !f.enabled })}
              className={`relative h-7 w-12 rounded-full transition ${f.enabled ? "bg-[#0068B7]" : "bg-slate-300"}`}>
              <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all ${f.enabled ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-sm font-bold text-slate-700">Prompt hướng dẫn (system prompt)</label>
          <p className="mb-2 text-xs text-slate-500">Mô tả vai trò, nhiệm vụ và phong cách trả lời. Đây là phần quyết định chatbot hướng dẫn thủ tục cho người dân thế nào.</p>
          <textarea value={f.systemPrompt} onChange={(e) => setF({ ...f, systemPrompt: e.target.value })}
            rows={14} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs leading-relaxed focus:border-[#0068B7] focus:outline-none" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="mb-1 block text-sm font-bold text-slate-700">Lời chào</label>
            <textarea value={f.welcomeMessage ?? ""} onChange={(e) => setF({ ...f, welcomeMessage: e.target.value })}
              rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="mb-1 block text-sm font-bold text-slate-700">Câu trả lời dự phòng</label>
            <p className="mb-1 text-xs text-slate-500">Hiển thị khi không có nhà cung cấp AI nào trả lời được.</p>
            <textarea value={f.fallbackMessage ?? ""} onChange={(e) => setF({ ...f, fallbackMessage: e.target.value })}
              rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <label className="mb-1 block text-sm font-bold text-slate-700">Câu hỏi gợi ý</label>
          <p className="mb-2 text-xs text-slate-500">Mỗi dòng là một gợi ý hiển thị cho người dân khi mở trợ lý.</p>
          <textarea value={questionsText} onChange={(e) => setQuestionsText(e.target.value)}
            rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-bold text-slate-700">Độ sáng tạo: <b className="text-[#0068B7]">{f.temperature.toFixed(1)}</b></label>
            <input type="range" min={0} max={1.5} step={0.1} value={f.temperature}
              onChange={(e) => setF({ ...f, temperature: Number(e.target.value) })} className="mt-2 w-full accent-[#0068B7]" />
            <p className="text-[11px] text-slate-400">Thấp = bám sát, cao = linh hoạt hơn</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-bold text-slate-700">Độ dài tối đa</label>
            <input type="number" min={64} max={8192} step={64} value={f.maxTokens}
              onChange={(e) => setF({ ...f, maxTokens: Number(e.target.value) })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            <p className="text-[11px] text-slate-400">Số token tối đa của câu trả lời</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <label className="text-sm font-bold text-slate-700">Nhà cung cấp ưu tiên</label>
            <select value={f.primaryRunnerId ?? ""} onChange={(e) => setF({ ...f, primaryRunnerId: e.target.value || null })}
              className="mt-2 w-full rounded-xl border border-slate-200 px-2 py-2 text-sm focus:border-[#0068B7] focus:outline-none">
              <option value="">Tự động chọn (theo sức khoẻ)</option>
              {runners.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={f.includeProcedureContext}
                onChange={(e) => setF({ ...f, includeProcedureContext: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
              Đưa danh mục thủ tục vào ngữ cảnh
            </label>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {config?.updatedByName ? `Cập nhật bởi ${config.updatedByName} • ` : ""}{config ? fmt(config.updatedAt) : ""}
          </span>
          <button onClick={save} disabled={busy === "save-config"}
            className="rounded-xl bg-[#0068B7] px-5 py-2.5 text-sm font-bold text-white hover:bg-[#005599] disabled:opacity-50">
            {busy === "save-config" ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </div>

      {/* Right: live test */}
      <div className="lg:sticky lg:top-4 h-fit rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-base font-black text-slate-900">Thử nghiệm trợ lý</h3>
        <p className="mb-3 text-xs text-slate-500">Gửi câu hỏi như người dân để kiểm tra phản hồi (dùng cấu hình đã lưu).</p>
        <textarea value={testMsg} onChange={(e) => setTestMsg(e.target.value)} rows={3}
          placeholder="VD: Tôi muốn đăng ký khai sinh cho con thì cần gì?"
          className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
        <button onClick={runTest} disabled={testing || !testMsg.trim()}
          className="mt-2 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white hover:bg-slate-700 disabled:opacity-50">
          {testing ? "Đang hỏi…" : "Gửi thử"}
        </button>
        {testReply && (
          <div className="mt-3 rounded-xl bg-slate-50 px-3 py-3 text-sm leading-relaxed text-slate-700 whitespace-pre-wrap">{testReply}</div>
        )}
      </div>
    </div>
  );
}

/* ── Tab 2: Providers ──────────────────────────────────── */
function ProvidersPanel({
  runners, busy, setBusy, reload, showToast,
}: {
  runners: Runner[]; busy: string | null; setBusy: (s: string | null) => void;
  reload: () => Promise<void>; showToast: (m: string) => void;
}) {
  const [editing, setEditing] = useState<Partial<Runner> | null>(null);

  const healthCheck = async (r: Runner) => {
    setBusy(`hc-${r.id}`);
    try { await api(`/ai-runners/${r.id}/health-check`, { method: "POST" }); await reload(); showToast(`Đã kiểm tra "${r.name}"`); }
    catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };
  const remove = async (r: Runner) => {
    if (!confirm(`Xoá nhà cung cấp "${r.name}"?`)) return;
    try { await api(`/ai-runners/${r.id}`, { method: "DELETE" }); await reload(); showToast("Đã xoá"); }
    catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setEditing({ provider: "OPENAI_COMPAT", capabilities: ALL_CAPS, priority: 5, timeoutMs: 30000, maxConcurrent: 4 })}
          className="rounded-xl bg-[#0068B7] px-4 py-2 text-sm font-bold text-white hover:bg-[#005599]">+ Thêm nhà cung cấp</button>
      </div>
      {runners.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">Chưa có nhà cung cấp AI nào.</div>
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {runners.map(r => {
            const tone = healthTone(r.health);
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h4 className="truncate font-bold text-slate-800">{r.name}</h4>
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                      {r.status === "DISABLED" && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">Tắt</span>}
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{r.modelName}</p>
                    <p className="truncate text-xs text-slate-500">{r.endpoint}</p>
                    <p className="mt-1 text-[11px] text-slate-400">
                      Ưu tiên {r.priority} • {r.latencyMs ? `${Math.round(r.latencyMs)}ms` : "—"} • lỗi {Math.round(r.failureRate * 100)}%
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button onClick={() => healthCheck(r)} disabled={busy === `hc-${r.id}`}
                      className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
                      {busy === `hc-${r.id}` ? "…" : "Kiểm tra"}
                    </button>
                    <button onClick={() => setEditing(r)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-[#0068B7] hover:bg-blue-50">Sửa</button>
                    <button onClick={() => remove(r)} className="rounded-lg px-2.5 py-1 text-xs font-bold text-red-500 hover:bg-red-50">Xoá</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {editing && <RunnerModal initial={editing} onClose={() => setEditing(null)}
        onSaved={async () => { setEditing(null); await reload(); showToast("Đã lưu nhà cung cấp"); }} showToast={showToast} />}
    </div>
  );
}

function RunnerModal({
  initial, onClose, onSaved, showToast,
}: {
  initial: Partial<Runner>; onClose: () => void; onSaved: () => void; showToast: (m: string) => void;
}) {
  const isEdit = !!initial.id;
  const [f, setF] = useState({
    name: initial.name ?? "", provider: initial.provider ?? "OPENAI_COMPAT",
    endpoint: initial.endpoint ?? "", modelName: initial.modelName ?? "",
    authKey: "", priority: initial.priority ?? 5, timeoutMs: initial.timeoutMs ?? 30000,
    maxConcurrent: initial.maxConcurrent ?? 4, capabilities: initial.capabilities ?? ALL_CAPS,
    status: initial.status ?? "ENABLED",
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!f.name.trim() || !f.endpoint.trim() || !f.modelName.trim()) { setErr("Nhập tên, endpoint và model."); return; }
    setSaving(true); setErr(null);
    try {
      const body: Record<string, unknown> = {
        name: f.name.trim(), provider: f.provider, endpoint: f.endpoint.trim(),
        modelName: f.modelName.trim(), priority: f.priority, timeoutMs: f.timeoutMs,
        maxConcurrent: f.maxConcurrent, capabilities: f.capabilities, status: f.status,
      };
      if (f.authKey.trim()) body.authKey = f.authKey.trim();
      if (isEdit) await api(`/ai-runners/${initial.id}`, { method: "PATCH", body: JSON.stringify(body) });
      else await api("/ai-runners", { method: "POST", body: JSON.stringify(body) });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-black text-slate-900">{isEdit ? "Sửa nhà cung cấp AI" : "Thêm nhà cung cấp AI"}</h3>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tên hiển thị *</label>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="VD: NVIDIA Llama-4"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Loại nhà cung cấp</label>
            <select value={f.provider} onChange={(e) => setF({ ...f, provider: e.target.value })}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none">
              {PROVIDERS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Endpoint (base URL) *</label>
            <input value={f.endpoint} onChange={(e) => setF({ ...f, endpoint: e.target.value })} placeholder="https://integrate.api.nvidia.com"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs focus:border-[#0068B7] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Tên model *</label>
            <input value={f.modelName} onChange={(e) => setF({ ...f, modelName: e.target.value })} placeholder="meta/llama-4-maverick-17b-128e-instruct"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs focus:border-[#0068B7] focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">API key {isEdit && <span className="font-normal text-slate-400">(để trống nếu giữ nguyên)</span>}</label>
            <input type="password" value={f.authKey} onChange={(e) => setF({ ...f, authKey: e.target.value })} placeholder={isEdit ? "••••••••" : "Bearer key"}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs focus:border-[#0068B7] focus:outline-none" autoComplete="off" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Ưu tiên</label>
              <input type="number" min={1} max={100} value={f.priority} onChange={(e) => setF({ ...f, priority: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Timeout (ms)</label>
              <input type="number" min={1000} step={1000} value={f.timeoutMs} onChange={(e) => setF({ ...f, timeoutMs: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Đồng thời</label>
              <input type="number" min={1} max={64} value={f.maxConcurrent} onChange={(e) => setF({ ...f, maxConcurrent: Number(e.target.value) })}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
          </div>
          {isEdit && (
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input type="checkbox" checked={f.status === "ENABLED"} onChange={(e) => setF({ ...f, status: e.target.checked ? "ENABLED" : "DISABLED" })} className="h-4 w-4 rounded border-slate-300" />
              Đang bật
            </label>
          )}
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button onClick={submit} disabled={saving} className="rounded-xl bg-[#0068B7] px-4 py-2 text-sm font-bold text-white hover:bg-[#005599] disabled:opacity-50">{saving ? "Đang lưu…" : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}

/* ── Tab 3: Conversation history ───────────────────────── */
function HistoryPanel({ conversations }: { conversations: Conversation[] }) {
  if (conversations.length === 0) {
    return <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">Chưa có cuộc hội thoại. Hội thoại xuất hiện sau khi người dân dùng trợ lý tại kiosk.</div>;
  }
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs text-slate-500">
          <tr>
            <th className="px-4 py-3">Phiên</th><th className="px-4 py-3">Ngôn ngữ</th>
            <th className="px-4 py-3">Bắt đầu</th><th className="px-4 py-3">Tin nhắn</th>
            <th className="px-4 py-3">Tin nhắn cuối</th><th className="px-4 py-3">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map(c => (
            <tr key={c.id} className="border-t border-slate-100">
              <td className="px-4 py-3"><span className="font-mono text-xs text-slate-500">{c.sessionId.slice(0, 8)}…</span></td>
              <td className="px-4 py-3">{c.language.toUpperCase()}</td>
              <td className="px-4 py-3 text-slate-600">{fmt(c.startedAt)}</td>
              <td className="px-4 py-3">{c._count.messages}</td>
              <td className="px-4 py-3"><span className="block max-w-xs truncate text-xs text-slate-600">{c.messages[0]?.content?.slice(0, 60) ?? "—"}</span></td>
              <td className="px-4 py-3">{c.totalTokens ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
