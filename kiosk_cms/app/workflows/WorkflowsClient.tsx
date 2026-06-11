"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { RecorderModal } from "./RecorderModal";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ── Types (mirror serialized Prisma rows) ───────────────── */
interface Step {
  id: string;
  stepOrder: number;
  stepType: string;
  name: string;
  description: string | null;
  isRequired: boolean;
  url: string | null;
  waitFor: string | null;
  waitTimeoutMs: number;
  selector: string | null;
  selectorAlt: string | null;
  selectorType: string;
  action: string;
  inputValue: string | null;
  uploadField: string | null;
  assertText: string | null;
  assertUrl: string | null;
  assertVisible: string | null;
  onFailure: string;
  retryCount: number;
  delayAfterMs: number;
  conditionExpr: string | null;
}
interface Template {
  id: string;
  procedureId: string | null;
  code: string;
  name: string;
  description: string | null;
  targetUrl: string;
  portalCode: string | null;
  authMethod: string;
  isActive: boolean;
  isPublished: boolean;
  timeoutSeconds: number;
  maxRetries: number;
  screenshotMode: string;
  version: number;
  updatedAt: string;
  publishedAt: string | null;
  steps: Step[];
  _count: { jobs: number };
}
interface Procedure { id: string; code: string; name: string }
interface Runner { id: string; runnerId: string; name: string; status: string; lastHeartbeat: string | null; activeSessions: number; capacity: number }

/* ── Enums for dropdowns ─────────────────────────────────── */
const STEP_TYPE_GROUPS: { group: string; types: { value: string; label: string }[] }[] = [
  {
    group: "Bước ngữ nghĩa (khuyến nghị)",
    types: [
      { value: "OPEN_URL", label: "Mở URL cổng DVC" },
      { value: "CLICK_MENU", label: "Bấm menu" },
      { value: "SEARCH_PROCEDURE", label: "Tìm thủ tục" },
      { value: "SELECT_RESULT", label: "Chọn kết quả tìm kiếm" },
      { value: "WAIT_VNEID_LOGIN", label: "Chờ đăng nhập VNeID" },
      { value: "INPUT_FIELD", label: "Điền ô nhập liệu" },
      { value: "SELECT_OPTION", label: "Chọn dropdown / radio" },
      { value: "UPLOAD_DOCUMENT", label: "Tải tài liệu lên" },
      { value: "WAIT_SUBMIT", label: "Bấm nộp & chờ" },
      { value: "DETECT_SUCCESS_TEXT", label: "Phát hiện thông báo thành công" },
      { value: "EXTRACT_APPLICATION_CODE", label: "Trích mã hồ sơ" },
      { value: "COMPLETE", label: "Hoàn tất" },
    ],
  },
  {
    group: "Lệnh cấp thấp",
    types: [
      { value: "NAVIGATE", label: "Điều hướng" },
      { value: "CLICK", label: "Bấm phần tử" },
      { value: "FILL", label: "Gõ vào input" },
      { value: "SELECT", label: "Chọn dropdown" },
      { value: "UPLOAD", label: "Upload file" },
      { value: "WAIT", label: "Chờ" },
      { value: "SCREENSHOT", label: "Chụp màn hình" },
      { value: "ASSERT", label: "Kiểm tra" },
      { value: "EXTRACT", label: "Trích dữ liệu" },
      { value: "SCROLL", label: "Cuộn tới" },
      { value: "CAPTCHA_WAIT", label: "Chờ giải CAPTCHA" },
    ],
  },
];
const ALL_STEP_TYPES = STEP_TYPE_GROUPS.flatMap(g => g.types);
const stepTypeLabel = (v: string) => ALL_STEP_TYPES.find(t => t.value === v)?.label ?? v;

const SELECTOR_TYPES = ["CSS", "XPATH", "ID", "NAME", "TEXT", "LINK_TEXT"];
const ON_FAILURE = [
  { value: "STOP", label: "Dừng quy trình" },
  { value: "RETRY", label: "Thử lại bước" },
  { value: "SKIP", label: "Bỏ qua, đi tiếp" },
  { value: "SCREENSHOT_STOP", label: "Chụp màn hình rồi dừng" },
];
const AUTH_METHODS = ["NONE", "VNEID_QR", "CCCD_CHIP", "USERNAME_PASSWORD", "OTP_SMS", "SSO_TOKEN"];
const SCREENSHOT_MODES = [
  { value: "ON_EACH_STEP", label: "Mỗi bước (hiển thị trực tiếp lên kiosk)" },
  { value: "ON_ERROR", label: "Chỉ khi lỗi" },
  { value: "ALWAYS", label: "Luôn luôn" },
  { value: "NEVER", label: "Không bao giờ" },
];

/* Which fields are relevant for a given step type (for UI hints) */
function fieldsFor(stepType: string) {
  const needsSelector = ["CLICK", "CLICK_MENU", "FILL", "INPUT_FIELD", "SELECT", "SELECT_OPTION", "SELECT_RESULT", "SEARCH_PROCEDURE", "UPLOAD", "UPLOAD_DOCUMENT", "WAIT_SUBMIT", "ASSERT", "EXTRACT", "EXTRACT_APPLICATION_CODE", "SCROLL", "WAIT"].includes(stepType);
  const needsUrl = ["OPEN_URL", "NAVIGATE"].includes(stepType);
  const needsInput = ["FILL", "INPUT_FIELD", "SELECT", "SELECT_OPTION", "SEARCH_PROCEDURE"].includes(stepType);
  const needsAssert = ["ASSERT", "DETECT_SUCCESS_TEXT"].includes(stepType);
  const needsUpload = ["UPLOAD", "UPLOAD_DOCUMENT"].includes(stepType);
  return { needsSelector, needsUrl, needsInput, needsAssert, needsUpload };
}

/* ── API helpers ─────────────────────────────────────────── */
async function api(path: string, method: string, body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ════════════════════════════════════════════════════════ */
export function WorkflowsClient({
  initialTemplates, procedures, runners,
}: { initialTemplates: Template[]; procedures: Procedure[]; runners: Runner[] }) {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(initialTemplates[0]?.id ?? null);
  const [creating, setCreating] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const selected = initialTemplates.find(t => t.id === selectedId) ?? null;
  const onlineRunners = runners.filter(r => r.status === "ONLINE" || r.status === "BUSY").length;

  const refresh = () => startTransition(() => router.refresh());
  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    try { await fn(); refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };

  return (
    <div className="space-y-4">
      {/* Runner status banner */}
      <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-3">
          <span className={`h-2.5 w-2.5 rounded-full ${onlineRunners > 0 ? "bg-green-500" : "bg-slate-300"}`} />
          <span className="text-sm font-semibold text-slate-700">
            {onlineRunners > 0 ? `${onlineRunners} runner sẵn sàng` : "Không có runner online"}
          </span>
          <span className="text-xs text-slate-400">
            {runners.map(r => `${r.runnerId} (${r.status})`).join(" · ") || "Chưa đăng ký runner"}
          </span>
        </div>
        <button
          onClick={() => { setCreating(true); setSelectedId(null); }}
          className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-blue-700"
        >
          + Tạo quy trình mới
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-[320px_1fr] gap-4">
        {/* ── Left: template list ───────────────────────────── */}
        <div className="space-y-2">
          {initialTemplates.length === 0 && !creating && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
              Chưa có quy trình nào. Bấm “Tạo quy trình mới”.
            </div>
          )}
          {initialTemplates.map(t => {
            const active = t.id === selectedId;
            const proc = procedures.find(p => p.id === t.procedureId);
            return (
              <button
                key={t.id}
                onClick={() => { setSelectedId(t.id); setCreating(false); }}
                className={`w-full rounded-2xl border p-4 text-left transition ${
                  active ? "border-blue-500 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs font-bold text-slate-500">{t.code}</span>
                  <div className="flex gap-1">
                    {t.isPublished
                      ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">PUBLISHED</span>
                      : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">DRAFT</span>}
                  </div>
                </div>
                <div className="mt-1.5 font-bold text-slate-900">{t.name}</div>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  <span>{t.steps.length} bước</span>
                  <span>·</span>
                  <span>{t._count.jobs} lần chạy</span>
                  {proc && <><span>·</span><span className="truncate">{proc.name}</span></>}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Right: editor ─────────────────────────────────── */}
        <div>
          {creating ? (
            <TemplateCreateForm
              procedures={procedures}
              onCancel={() => { setCreating(false); setSelectedId(initialTemplates[0]?.id ?? null); }}
              onCreated={(id) => { setCreating(false); setSelectedId(id); refresh(); }}
              onError={setError}
            />
          ) : selected ? (
            <TemplateEditor
              key={selected.id}
              template={selected}
              procedures={procedures}
              pending={pending}
              run={run}
            />
          ) : (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-16 text-center text-slate-400">
              Chọn một quy trình ở bên trái, hoặc tạo mới.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Create form ─────────────────────────────────────────── */
function TemplateCreateForm({
  procedures, onCancel, onCreated, onError,
}: { procedures: Procedure[]; onCancel: () => void; onCreated: (id: string) => void; onError: (e: string) => void }) {
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [targetUrl, setTargetUrl] = useState("https://dichvucong.gov.vn/");
  const [procedureId, setProcedureId] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim() || !name.trim() || !targetUrl.trim()) { onError("Mã, tên và URL là bắt buộc."); return; }
    setBusy(true); onError("");
    try {
      const created = await api("/selenium/templates", "POST", {
        code: code.trim(), name: name.trim(), targetUrl: targetUrl.trim(),
        procedureId: procedureId || undefined,
        screenshotMode: "ON_EACH_STEP",
      });
      onCreated(created.id);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  }

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-black text-slate-900">Tạo quy trình mới</h2>
      <p className="mt-1 text-sm text-slate-500">Khai báo thông tin cơ bản, sau đó thêm các bước.</p>
      <div className="mt-5 grid gap-4">
        <Field label="Mã quy trình *" hint="Viết HOA, không dấu — vd WF_KHAISINH">
          <input value={code} onChange={e => setCode(e.target.value.toUpperCase())} placeholder="WF_KHAISINH"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
        </Field>
        <Field label="Tên hiển thị *">
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Đăng ký khai sinh trực tuyến"
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
        </Field>
        <Field label="URL cổng đích *">
          <input value={targetUrl} onChange={e => setTargetUrl(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
        </Field>
        <Field label="Gắn với thủ tục" hint="Quy trình sẽ được gọi khi công dân chọn thủ tục này">
          <select value={procedureId} onChange={e => setProcedureId(e.target.value)}
            className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
            <option value="">— Chưa gắn —</option>
            {procedures.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="mt-6 flex gap-3">
        <button onClick={submit} disabled={busy}
          className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-50">
          {busy ? "Đang tạo…" : "Tạo quy trình"}
        </button>
        <button onClick={onCancel} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
          Huỷ
        </button>
      </div>
    </div>
  );
}

/* ── Template editor ─────────────────────────────────────── */
function TemplateEditor({
  template, procedures, pending, run,
}: { template: Template; procedures: Procedure[]; pending: boolean; run: (fn: () => Promise<unknown>) => Promise<void> }) {
  const [meta, setMeta] = useState({
    name: template.name,
    description: template.description ?? "",
    targetUrl: template.targetUrl,
    procedureId: template.procedureId ?? "",
    authMethod: template.authMethod,
    screenshotMode: template.screenshotMode,
    timeoutSeconds: template.timeoutSeconds,
  });
  const [metaDirty, setMetaDirty] = useState(false);
  const [editingStep, setEditingStep] = useState<Step | "new" | null>(null);
  const [recording, setRecording] = useState(false);

  const setM = <K extends keyof typeof meta>(k: K, v: (typeof meta)[K]) => {
    setMeta(prev => ({ ...prev, [k]: v })); setMetaDirty(true);
  };

  const saveMeta = () => run(async () => {
    await api(`/selenium/templates/${template.id}`, "PATCH", {
      name: meta.name, description: meta.description || undefined, targetUrl: meta.targetUrl,
      procedureId: meta.procedureId || undefined, authMethod: meta.authMethod,
      screenshotMode: meta.screenshotMode, timeoutSeconds: Number(meta.timeoutSeconds),
    });
    setMetaDirty(false);
  });

  const togglePublish = () => run(() => api(`/selenium/templates/${template.id}`, "PATCH", { isPublished: !template.isPublished }));
  const deleteTemplate = () => { if (confirm(`Xoá quy trình "${template.name}"?`)) run(() => api(`/selenium/templates/${template.id}`, "DELETE")); };
  const deleteStep = (s: Step) => { if (confirm(`Xoá bước "${s.name}"?`)) run(() => api(`/selenium/templates/${template.id}/steps/${s.id}`, "DELETE")); };

  const moveStep = (idx: number, dir: -1 | 1) => {
    const a = template.steps[idx], b = template.steps[idx + dir];
    if (!a || !b) return;
    run(async () => {
      await api(`/selenium/templates/${template.id}/steps/${a.id}`, "PATCH", { stepOrder: b.stepOrder });
      await api(`/selenium/templates/${template.id}/steps/${b.id}`, "PATCH", { stepOrder: a.stepOrder });
    });
  };

  const proc = procedures.find(p => p.id === template.procedureId);
  const publishable = template.steps.length > 0 && !!template.procedureId;

  return (
    <div className="space-y-4">
      {/* Header card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold text-slate-500">{template.code}</span>
              <span className="text-xs text-slate-400">v{template.version}</span>
              {template.isPublished
                ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">PUBLISHED</span>
                : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">DRAFT</span>}
            </div>
            <h2 className="mt-1 text-xl font-black text-slate-900">{template.name}</h2>
            <p className="mt-0.5 text-xs text-slate-400">
              {proc ? `→ ${proc.name}` : "⚠ chưa gắn thủ tục"} · {template._count.jobs} lần chạy
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setRecording(true)}
              disabled={pending}
              title="Mở cổng dịch vụ công trên runner và bấm để tự động ghi lại các bước"
              className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-700 disabled:opacity-40"
            >
              <span className="h-2 w-2 rounded-full bg-white" /> Ghi quy trình
            </button>
            <button
              onClick={togglePublish}
              disabled={pending || (!template.isPublished && !publishable)}
              title={!publishable && !template.isPublished ? "Cần ≥1 bước và gắn thủ tục trước khi publish" : ""}
              className={`rounded-xl px-4 py-2 text-sm font-bold transition disabled:opacity-40 ${
                template.isPublished ? "border border-slate-300 text-slate-600 hover:bg-slate-50" : "bg-green-600 text-white hover:bg-green-700"
              }`}
            >
              {template.isPublished ? "Gỡ xuất bản" : "Xuất bản"}
            </button>
            <button onClick={deleteTemplate} disabled={pending}
              className="rounded-xl border border-red-200 px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50">
              Xoá
            </button>
          </div>
        </div>

        {/* Meta fields */}
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field label="Tên hiển thị">
            <input value={meta.name} onChange={e => setM("name", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </Field>
          <Field label="Gắn với thủ tục">
            <select value={meta.procedureId} onChange={e => setM("procedureId", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              <option value="">— Chưa gắn —</option>
              {procedures.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
            </select>
          </Field>
          <Field label="URL cổng đích">
            <input value={meta.targetUrl} onChange={e => setM("targetUrl", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
          </Field>
          <Field label="Xác thực">
            <select value={meta.authMethod} onChange={e => setM("authMethod", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {AUTH_METHODS.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Field>
          <Field label="Chế độ chụp màn hình" hint="ON_EACH_STEP để kiosk xem trực tiếp">
            <select value={meta.screenshotMode} onChange={e => setM("screenshotMode", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {SCREENSHOT_MODES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Timeout (giây)">
            <input type="number" value={meta.timeoutSeconds} onChange={e => setM("timeoutSeconds", Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </Field>
        </div>
        {metaDirty && (
          <div className="mt-4 flex gap-2">
            <button onClick={saveMeta} disabled={pending}
              className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
              Lưu thay đổi
            </button>
            <button onClick={() => { setMeta({ name: template.name, description: template.description ?? "", targetUrl: template.targetUrl, procedureId: template.procedureId ?? "", authMethod: template.authMethod, screenshotMode: template.screenshotMode, timeoutSeconds: template.timeoutSeconds }); setMetaDirty(false); }}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              Hoàn tác
            </button>
          </div>
        )}
      </div>

      {/* Steps */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-black text-slate-900">Các bước thực thi ({template.steps.length})</h3>
          <button onClick={() => setEditingStep("new")}
            className="rounded-xl border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm font-bold text-blue-700 hover:bg-blue-100">
            + Thêm bước
          </button>
        </div>

        {template.steps.length === 0 ? (
          <div className="rounded-xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
            Chưa có bước nào. Thêm bước đầu tiên (thường là “Mở URL cổng DVC”).
          </div>
        ) : (
          <ol className="space-y-2">
            {template.steps.map((s, idx) => (
              <li key={s.id} className="group flex items-center gap-3 rounded-xl border border-slate-200 p-3 hover:border-slate-300">
                <div className="flex flex-col">
                  <button onClick={() => moveStep(idx, -1)} disabled={idx === 0 || pending} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">▲</button>
                  <button onClick={() => moveStep(idx, 1)} disabled={idx === template.steps.length - 1 || pending} className="text-slate-300 hover:text-slate-600 disabled:opacity-20">▼</button>
                </div>
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{s.stepOrder}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{s.name}</span>
                    <span className="rounded-md bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">{stepTypeLabel(s.stepType)}</span>
                    {!s.isRequired && <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">tuỳ chọn</span>}
                  </div>
                  {(s.selector || s.url || s.inputValue) && (
                    <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">
                      {s.url || s.selector}{s.inputValue ? ` ← ${s.inputValue}` : ""}
                    </div>
                  )}
                </div>
                <button onClick={() => setEditingStep(s)} className="rounded-lg px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100">Sửa</button>
                <button onClick={() => deleteStep(s)} className="rounded-lg px-2 py-1 text-xs font-semibold text-red-500 hover:bg-red-50">Xoá</button>
              </li>
            ))}
          </ol>
        )}
      </div>

      {editingStep && (
        <StepEditorModal
          templateId={template.id}
          step={editingStep === "new" ? null : editingStep}
          nextOrder={template.steps.length + 1}
          onClose={() => setEditingStep(null)}
          onSaved={() => { setEditingStep(null); run(async () => {}); }}
        />
      )}

      {recording && (
        <RecorderModal
          templateId={template.id}
          targetUrl={meta.targetUrl || template.targetUrl}
          onClose={() => { setRecording(false); run(async () => {}); }}
          onSaved={() => { setRecording(false); run(async () => {}); }}
        />
      )}
    </div>
  );
}

/* ── Step editor modal ───────────────────────────────────── */
function StepEditorModal({
  templateId, step, nextOrder, onClose, onSaved,
}: { templateId: string; step: Step | null; nextOrder: number; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    stepType: step?.stepType ?? "OPEN_URL",
    name: step?.name ?? "",
    description: step?.description ?? "",
    isRequired: step?.isRequired ?? true,
    url: step?.url ?? "",
    selector: step?.selector ?? "",
    selectorAlt: step?.selectorAlt ?? "",
    selectorType: step?.selectorType ?? "CSS",
    inputValue: step?.inputValue ?? "",
    waitFor: step?.waitFor ?? "",
    waitTimeoutMs: step?.waitTimeoutMs ?? 10000,
    uploadField: step?.uploadField ?? "",
    assertText: step?.assertText ?? "",
    onFailure: step?.onFailure ?? "STOP",
    delayAfterMs: step?.delayAfterMs ?? 500,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF(prev => ({ ...prev, [k]: v }));
  const hints = useMemo(() => fieldsFor(f.stepType), [f.stepType]);

  async function save() {
    if (!f.name.trim()) { setErr("Tên bước là bắt buộc."); return; }
    setBusy(true); setErr(null);
    const body = {
      stepType: f.stepType, name: f.name.trim(), description: f.description || undefined,
      isRequired: f.isRequired,
      url: f.url || undefined, selector: f.selector || undefined, selectorAlt: f.selectorAlt || undefined,
      selectorType: f.selectorType, inputValue: f.inputValue || undefined,
      waitFor: f.waitFor || undefined, waitTimeoutMs: Number(f.waitTimeoutMs),
      uploadField: f.uploadField || undefined, assertText: f.assertText || undefined,
      onFailure: f.onFailure, delayAfterMs: Number(f.delayAfterMs),
    };
    try {
      if (step) await api(`/selenium/templates/${templateId}/steps/${step.id}`, "PATCH", body);
      else await api(`/selenium/templates/${templateId}/steps`, "POST", { ...body, stepOrder: nextOrder });
      onSaved();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-6" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-900">{step ? "Sửa bước" : "Thêm bước mới"}</h3>

        {err && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

        <div className="mt-4 grid gap-4">
          <Field label="Loại bước">
            <select value={f.stepType} onChange={e => set("stepType", e.target.value)}
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
              {STEP_TYPE_GROUPS.map(g => (
                <optgroup key={g.group} label={g.group}>
                  {g.types.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </optgroup>
              ))}
            </select>
          </Field>

          <Field label="Tên bước *">
            <input value={f.name} onChange={e => set("name", e.target.value)} placeholder="vd: Tìm thủ tục khai sinh"
              className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
          </Field>

          {hints.needsUrl && (
            <Field label="URL" hint="Có thể dùng {{citizen.field}}">
              <input value={f.url} onChange={e => set("url", e.target.value)} placeholder="https://dichvucong.gov.vn/..."
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          )}

          {hints.needsSelector && (
            <>
              <div className="grid grid-cols-[1fr_140px] gap-3">
                <Field label="Selector" hint="CSS / XPath tới phần tử">
                  <input value={f.selector} onChange={e => set("selector", e.target.value)} placeholder='vd: input#search hoặc //a[contains(.,"Khai sinh")]'
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
                </Field>
                <Field label="Loại selector">
                  <select value={f.selectorType} onChange={e => set("selectorType", e.target.value)}
                    className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                    {SELECTOR_TYPES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Selector dự phòng" hint="Thử khi selector chính không tìm thấy">
                <input value={f.selectorAlt} onChange={e => set("selectorAlt", e.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
              </Field>
            </>
          )}

          {hints.needsInput && (
            <Field label="Giá trị nhập" hint="Tĩnh hoặc template — vd {{citizen.fullName}}">
              <input value={f.inputValue} onChange={e => set("inputValue", e.target.value)} placeholder="{{citizen.fullName}}"
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          )}

          {hints.needsUpload && (
            <Field label="Tên field upload" hint="Để trống → tự tìm input[type=file]">
              <input value={f.uploadField} onChange={e => set("uploadField", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          )}

          {hints.needsAssert && (
            <Field label="Văn bản cần phát hiện" hint="vd: thành công / đã tiếp nhận">
              <input value={f.assertText} onChange={e => set("assertText", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Chờ selector (tuỳ chọn)" hint="CSS cần xuất hiện trước khi tiếp tục">
              <input value={f.waitFor} onChange={e => set("waitFor", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
            <Field label="Timeout chờ (ms)">
              <input type="number" value={f.waitTimeoutMs} onChange={e => set("waitTimeoutMs", Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Khi lỗi">
              <select value={f.onFailure} onChange={e => set("onFailure", e.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none">
                {ON_FAILURE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </Field>
            <Field label="Chờ sau bước (ms)">
              <input type="number" value={f.delayAfterMs} onChange={e => set("delayAfterMs", Number(e.target.value))}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none" />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.isRequired} onChange={e => set("isRequired", e.target.checked)} className="h-4 w-4 rounded" />
            Bước bắt buộc (nếu lỗi sẽ dừng cả quy trình theo cấu hình “Khi lỗi”)
          </label>
        </div>

        <div className="mt-6 flex gap-3">
          <button onClick={save} disabled={busy}
            className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy ? "Đang lưu…" : step ? "Cập nhật bước" : "Thêm bước"}
          </button>
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
            Huỷ
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Small field wrapper ─────────────────────────────────── */
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
