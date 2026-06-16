"use client";
/*
 * Workflow Recorder (admin authoring) — runs INSIDE the Tauri app.
 *
 * The Tauri shell already spawns the automation engine (ENGINE_ROLE=recorder).
 * This screen drives it over Tauri IPC (engine-bridge): pick a workflow template,
 * the engine opens its target URL in an off-screen Chromium and streams the live
 * portal here over WebRTC; every click on the <video> is captured as a robust
 * semantic step, edited/bound to CCCD variables, and saved back to the API via
 * PUT /selenium/templates/:id/steps. No localhost WebSocket, no API in the media
 * path — same workflow JSON as before, so the CMS editor stays compatible.
 *
 * Reached via `?mode=record` (see app/page.tsx). The citizen kiosk flow never
 * renders this.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { engineSend, onEngineMessage, onEngineStatus, isTauri } from "../../lib/engine-bridge";
import { useBrowserOverlay } from "../../lib/use-browser-overlay";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ── Types ──────────────────────────────────────────────────────── */
interface CitizenVariable { key: string; label: string; group: string; example: string; fromCccd: boolean; match: string[] }

interface TemplateLite {
  id: string; code: string; name: string; targetUrl: string;
  isPublished: boolean; steps: { id: string }[];
}

export interface RecStep {
  key: string; stepType: string; name: string;
  selector?: string; selectorType?: string; inputValue?: string; sampleValue?: string;
  url?: string; waitFor?: string; assertText?: string; uploadField?: string;
  onFailure?: string; isInput?: boolean; isSelect?: boolean;
}

interface RecordedAction {
  kind: "open" | "click" | "fill" | "url";
  selector?: string; selectorType?: string; tag?: string; inputType?: string;
  isInput?: boolean; isSelect?: boolean; isCheckable?: boolean;
  text?: string; name?: string; elId?: string; ariaLabel?: string; label?: string;
  placeholder?: string; href?: string; url?: string; value?: string;
}

let keySeq = 0;
const nextKey = () => `s${++keySeq}_${Date.now()}`;

/* ── Binding helpers (mirror API workflow-variables.ts) ─────────── */
function normTok(s: string): string {
  return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase().replace(/[^a-z0-9]/g, "");
}
function guessBinding(
  hints: { name?: string | null; elId?: string | null; placeholder?: string | null; label?: string | null; ariaLabel?: string | null },
  vars: CitizenVariable[],
): string | null {
  const hay = normTok([hints.name, hints.elId, hints.placeholder, hints.label, hints.ariaLabel].filter(Boolean).join(" "));
  if (!hay) return null;
  let best: { key: string; len: number } | null = null;
  for (const v of vars) for (const tok of v.match ?? []) {
    if (hay.includes(tok) && (!best || tok.length > best.len)) best = { key: v.key, len: tok.length };
  }
  return best?.key ?? null;
}
const isBinding = (v?: string) => !!v && /\{\{\s*[\w.]+\s*\}\}/.test(v);
const bindingKey = (v?: string) => (v ? (v.match(/\{\{\s*([\w.]+)\s*\}\}/)?.[1] ?? null) : null);

const MANUAL_STEPS: { stepType: string; name: string; hint: string }[] = [
  { stepType: "WAIT_VNEID_LOGIN", name: "Chờ công dân đăng nhập VNeID", hint: "Tạm dừng cho công dân xác thực VNeID" },
  { stepType: "WAIT_SUBMIT", name: "Bấm nộp & chờ xử lý", hint: "Chờ trang xử lý sau khi nộp" },
  { stepType: "DETECT_SUCCESS_TEXT", name: "Phát hiện thông báo thành công", hint: "Kiểm tra text báo thành công" },
  { stepType: "EXTRACT_APPLICATION_CODE", name: "Trích mã hồ sơ", hint: "Lấy mã biên nhận sau khi nộp" },
  { stepType: "WAIT", name: "Chờ", hint: "Chờ một khoảng thời gian / phần tử" },
  { stepType: "UPLOAD_DOCUMENT", name: "Tải tài liệu lên", hint: "Đính kèm tệp (scan kiosk / QR điện thoại)" },
];
const STEP_LABEL: Record<string, string> = {
  OPEN_URL: "Mở URL", CLICK: "Bấm", CLICK_MENU: "Bấm menu", INPUT_FIELD: "Điền ô",
  SELECT_OPTION: "Chọn dropdown", SEARCH_PROCEDURE: "Tìm thủ tục", WAIT_VNEID_LOGIN: "Chờ VNeID",
  WAIT_SUBMIT: "Nộp & chờ", DETECT_SUCCESS_TEXT: "Phát hiện thành công",
  EXTRACT_APPLICATION_CODE: "Trích mã HS", WAIT: "Chờ", UPLOAD_DOCUMENT: "Tải tệp",
};

function actionToStep(a: RecordedAction, vars: CitizenVariable[]): RecStep | null {
  if (a.kind === "open") return { key: nextKey(), stepType: "OPEN_URL", name: "Mở cổng dịch vụ công", url: a.url };
  if (a.kind === "click") {
    const labelHint = a.label || a.placeholder || a.name || a.text || "";
    const bind = (a.isInput || a.isSelect) ? guessBinding(a, vars) : null;
    const boundVal = bind ? `{{${bind}}}` : "";
    if (a.isInput) return { key: nextKey(), stepType: "INPUT_FIELD", name: `Điền: ${labelHint || "ô nhập"}`.slice(0, 60), selector: a.selector, selectorType: a.selectorType, inputValue: boundVal, isInput: true };
    if (a.isSelect) return { key: nextKey(), stepType: "SELECT_OPTION", name: `Chọn: ${labelHint || "dropdown"}`.slice(0, 60), selector: a.selector, selectorType: a.selectorType, inputValue: boundVal, isSelect: true };
    const label = a.text ? `Bấm: ${a.text}` : "Bấm phần tử";
    return { key: nextKey(), stepType: a.text && (a.tag === "a" || a.tag === "button") ? "CLICK_MENU" : "CLICK", name: label.slice(0, 60), selector: a.selector, selectorType: a.selectorType };
  }
  return null;
}

/* ── Variable picker dropdown ───────────────────────────────────── */
function VarPicker({ step, vars, onPick, onClear }: { step: RecStep; vars: CitizenVariable[]; onPick: (key: string) => void; onClear: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  const bound = isBinding(step.inputValue);
  const curKey = bindingKey(step.inputValue);
  const curVar = vars.find(v => v.key === curKey);
  const groups: Record<string, CitizenVariable[]> = {};
  for (const v of vars) (groups[v.group] ??= []).push(v);
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} title="Gắn dữ liệu động từ CCCD"
        className={`flex shrink-0 items-center gap-1 rounded-md border px-2 py-1 text-xs font-bold transition-colors ${bound ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-white text-slate-500 hover:border-blue-400 hover:text-blue-600"}`}>
        🔗 {bound ? (curVar?.label ?? "Động") : "Dữ liệu"}
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl">
          {bound && (
            <button onClick={() => { onClear(); setOpen(false); }} className="mb-1 w-full rounded-lg px-2 py-1.5 text-left text-xs font-semibold text-red-500 hover:bg-red-50">
              ✕ Bỏ ràng buộc — dùng giá trị cố định
            </button>
          )}
          {Object.entries(groups).map(([group, list]) => (
            <div key={group} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">{group}</p>
              {list.map(v => (
                <button key={v.key} onClick={() => { onPick(v.key); setOpen(false); }}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-blue-50 ${curKey === v.key ? "bg-blue-50 font-bold text-blue-700" : "text-slate-700"}`}>
                  <span className="flex items-center gap-1.5">{v.fromCccd && <span title="Từ CCCD" className="text-[9px]">🪪</span>}{v.label}</span>
                  <span className="font-mono text-[9px] text-slate-400">{v.example}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════ */
export function WorkflowRecordScreen({ onExitRecorder }: { onExitRecorder?: () => void } = {}) {
  const [phase, setPhase] = useState<"pick" | "record">("pick");
  const [templates, setTemplates] = useState<TemplateLite[]>([]);
  const [picked, setPicked] = useState<TemplateLite | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  /* Load the template list for the picker */
  const loadTemplates = useCallback(() => {
    setLoadErr(null);
    fetch(`${API_URL}/selenium/templates`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then((data: TemplateLite[]) => setTemplates(data))
      .catch(e => setLoadErr(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { loadTemplates(); }, [loadTemplates]);

  if (phase === "record" && picked) {
    return <RecorderSurface template={picked} onExit={() => { setPhase("pick"); setPicked(null); loadTemplates(); }} />;
  }

  return (
    <div className="flex h-full w-full flex-col bg-slate-100 p-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-black text-slate-900">Ghi quy trình tự động</h1>
            <p className="mt-1 text-sm text-slate-500">
              Chọn một quy trình để ghi lại các bước trên Cổng dịch vụ công. Trình duyệt tự động chạy ngay trên máy này.
            </p>
          </div>
          {onExitRecorder && (
            <button onClick={onExitRecorder}
              className="shrink-0 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">
              ← Về kiosk
            </button>
          )}
        </div>
        {!isTauri() && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            Chức năng ghi chỉ chạy trong ứng dụng kiosk (Tauri). Mở bằng ứng dụng desktop để dùng.
          </div>
        )}
        {loadErr && (
          <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            Không tải được danh sách quy trình: {loadErr}
            <button onClick={loadTemplates} className="ml-2 font-bold underline">Thử lại</button>
          </div>
        )}
        <div className="mt-6 space-y-2">
          {templates.length === 0 && !loadErr && (
            <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center text-sm text-slate-400">
              Chưa có quy trình nào. Tạo quy trình trong CMS trước, sau đó quay lại đây để ghi các bước.
            </div>
          )}
          {templates.map(t => (
            <button key={t.id} onClick={() => { setPicked(t); setPhase("record"); }}
              className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 text-left transition hover:border-blue-400 hover:shadow-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-bold text-slate-500">{t.code}</span>
                  {t.isPublished
                    ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">PUBLISHED</span>
                    : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">DRAFT</span>}
                </div>
                <div className="mt-1 truncate font-bold text-slate-900">{t.name}</div>
                <div className="mt-0.5 truncate font-mono text-[11px] text-slate-400">{t.targetUrl}</div>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-xs text-slate-400">{t.steps?.length ?? 0} bước</span>
                <span className="flex items-center gap-2 rounded-xl bg-red-600 px-3 py-2 text-sm font-bold text-white">
                  <span className="h-2 w-2 rounded-full bg-white" /> Ghi
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── The live recording surface (video + step editor + save) ────── */
function RecorderSurface({ template, onExit }: { template: TemplateLite; onExit: () => void }) {
  const [steps, setSteps] = useState<RecStep[]>([]);
  const [vars, setVars] = useState<CitizenVariable[]>([]);
  const [currentUrl, setCurrentUrl] = useState(template.targetUrl);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"connecting" | "live" | "no-engine" | "error">("connecting");
  const [saving, setSaving] = useState(false);
  const [copyJson, setCopyJson] = useState<string | null>(null);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const varsRef = useRef<CitizenVariable[]>([]);

  // Glue the real chromeless Chromium window over the frame region.
  useBrowserOverlay(frameRef, isTauri());

  const setStep = (key: string, patch: Partial<RecStep>) => setSteps(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const removeStep = (key: string) => setSteps(prev => prev.filter(s => s.key !== key));
  const moveStep = (i: number, dir: -1 | 1) => setSteps(prev => {
    const n = [...prev]; const j = i + dir;
    if (j < 0 || j >= n.length) return prev;
    [n[i], n[j]] = [n[j], n[i]]; return n;
  });

  useEffect(() => {
    fetch(`${API_URL}/workflows/variables`).then(r => r.json())
      .then((data: CitizenVariable[]) => { setVars(data); varsRef.current = data; })
      .catch(() => { /* picker just stays empty */ });
  }, []);

  const ingestRecorded = useCallback((a: RecordedAction) => {
    if (a.kind === "fill") {
      setSteps(prev => {
        for (let i = prev.length - 1; i >= 0; i--) {
          if (prev[i].selector === a.selector && (prev[i].stepType === "INPUT_FIELD" || prev[i].stepType === "SELECT_OPTION")) {
            const n = [...prev]; const cur = n[i];
            n[i] = { ...cur, sampleValue: a.value ?? "", inputValue: isBinding(cur.inputValue) ? cur.inputValue : (a.value ?? "") };
            return n;
          }
        }
        return prev;
      });
      return;
    }
    if (a.kind === "open") {
      setSteps(prev => (prev.some(s2 => s2.stepType === "OPEN_URL") ? prev : [actionToStep(a, varsRef.current)!, ...prev]));
      return;
    }
    const step = actionToStep(a, varsRef.current);
    if (step) setSteps(prev => [...prev, step]);
  }, []);

  /* Drive the engine over Tauri IPC. The engine opens a chromeless Chromium
   * over the frame (positioned by useBrowserOverlay); recorded steps + the live
   * URL arrive as engine messages. The admin clicks the REAL portal directly. */
  useEffect(() => {
    let disposed = false;
    if (!isTauri()) { setStatus("no-engine"); return; }

    const offMsg = onEngineMessage((msg) => {
      if (disposed) return;
      if (msg.evt === "recorded") {
        setReady(true);
        setStatus("live");
        ingestRecorded(msg.action as RecordedAction);
      } else if (msg.evt === "ready") {
        setReady(true);
        setStatus("live");
      } else if (msg.evt === "page-url" && typeof msg.url === "string") {
        setCurrentUrl(msg.url);
      } else if (msg.evt === "error") {
        setStatus("error");
      }
    });

    engineSend({ cmd: "start-record", url: template.targetUrl });
    const offStatus = onEngineStatus(({ ready: engineReady }) => {
      if (engineReady && !disposed) engineSend({ cmd: "start-record", url: template.targetUrl });
    });

    return () => {
      disposed = true;
      offMsg();
      offStatus();
      engineSend({ cmd: "stop" });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [template.id, template.targetUrl, ingestRecorded]);

  // The "Copy sang CMS" modal is centered in the WebView — hide the (top-most)
  // overlay browser while it's open so it isn't covered by the real Chromium.
  useEffect(() => {
    if (!isTauri()) return;
    engineSend({ cmd: "show-browser", visible: copyJson === null });
  }, [copyJson]);

  const addManual = (m: { stepType: string; name: string }) =>
    setSteps(prev => [...prev, { key: nextKey(), stepType: m.stepType, name: m.name, onFailure: "STOP" }]);

  const fillField = (s: RecStep) => {
    if (!s.selector) return;
    let text = s.inputValue ?? "";
    if (isBinding(s.inputValue)) {
      const v = vars.find(vv => vv.key === bindingKey(s.inputValue));
      text = s.sampleValue || v?.example || "";
    }
    engineSend({ cmd: "preview-fill", selector: s.selector, selectorType: s.selectorType, text });
  };

  const buildPayload = () => steps.map(s => ({
    stepType: s.stepType, name: s.name, selector: s.selector || undefined, selectorType: s.selectorType || "CSS",
    inputValue: s.inputValue || undefined, url: s.url || undefined, waitFor: s.waitFor || undefined,
    assertText: s.assertText || undefined, uploadField: s.uploadField || undefined, onFailure: s.onFailure ?? "STOP",
  }));

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`${API_URL}/selenium/templates/${template.id}/steps`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: buildPayload() }),
      });
      if (!res.ok) throw new Error(await res.text());
      onExit();
    } catch (e) {
      alert("Lưu thất bại: " + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  /* Copy the recorded result as a portable JSON envelope the CMS can import.
   * This is the transfer path when the kiosk can't write to the API directly —
   * the admin pastes it into the CMS workflow editor (Nhập từ recorder). */
  function openCopy() {
    const env = {
      _: "kiosk-recorder/v1",
      code: template.code,
      name: template.name,
      targetUrl: currentUrl || template.targetUrl,
      steps: buildPayload(),
    };
    setCopyJson(JSON.stringify(env, null, 2));
  }

  const boundCount = steps.filter(s => isBinding(s.inputValue)).length;

  return (
    <div className="flex h-full w-full flex-col bg-slate-900 p-4">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Left: live browser */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-red-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> ĐANG GHI
            </span>
            <span className="rounded-md bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-600">{template.code}</span>
            <div className="flex-1 truncate rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-500">
              {currentUrl.replace(/^https?:\/\//, "")}
            </div>
            <span className="text-xs text-slate-400">Chạm trực tiếp vào trang để ghi thao tác</span>
          </div>
          {/* Frame region — the REAL chromeless Chromium window is positioned
              over this div by the engine. It stays empty (the OS browser covers
              it); the placeholder below only shows until the browser appears. */}
          <div ref={frameRef} className="relative flex-1 overflow-hidden bg-slate-50">
            {!ready && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                <p className="max-w-sm text-center text-sm font-semibold">
                  {status === "no-engine"
                    ? "Engine tự động hoá chưa sẵn sàng. Mở bằng ứng dụng kiosk (Tauri)."
                    : status === "error"
                    ? "Engine báo lỗi khi mở trang. Kiểm tra log ứng dụng."
                    : "Đang mở trình duyệt thật trên khung này…"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Right: recorded steps */}
        <div className="flex w-[440px] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <h3 className="font-black text-slate-900">Các bước đã ghi ({steps.length})</h3>
              {boundCount > 0 && <p className="text-[11px] font-semibold text-emerald-600">🪪 {boundCount} ô gắn dữ liệu CCCD động</p>}
            </div>
            <button onClick={onExit} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">✕ Đóng</button>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2.5">
            {MANUAL_STEPS.map(m => (
              <button key={m.stepType} onClick={() => addManual(m)} title={m.hint}
                className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-blue-400 hover:text-blue-600">
                + {STEP_LABEL[m.stepType] ?? m.stepType}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {steps.length === 0 && (
              <div className="rounded-xl border-2 border-dashed border-slate-200 p-6 text-center text-sm text-slate-400">
                Chạm vào các nút / ô trên trang bên trái — mỗi thao tác sẽ thành một bước ở đây.
                <br /><span className="text-xs">Các ô như Tỉnh/Phường/Họ tên sẽ tự gắn dữ liệu CCCD.</span>
              </div>
            )}
            {steps.map((s, i) => {
              const bound = isBinding(s.inputValue);
              const curVar = vars.find(v => v.key === bindingKey(s.inputValue));
              const fillable = s.stepType === "INPUT_FIELD" || s.stepType === "SELECT_OPTION" || s.stepType === "SEARCH_PROCEDURE";
              return (
                <div key={s.key} className={`rounded-xl border p-2.5 ${bound ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200"}`}>
                  <div className="flex items-center gap-2">
                    <div className="flex flex-col">
                      <button onClick={() => moveStep(i, -1)} disabled={i === 0} className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-20">▲</button>
                      <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1} className="text-[10px] text-slate-300 hover:text-slate-600 disabled:opacity-20">▼</button>
                    </div>
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">{i + 1}</span>
                    <input value={s.name} onChange={e => setStep(s.key, { name: e.target.value })}
                      className="min-w-0 flex-1 rounded-md border border-transparent px-1.5 py-1 text-sm font-semibold text-slate-800 hover:border-slate-200 focus:border-blue-400 focus:outline-none" />
                    <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-700">{STEP_LABEL[s.stepType] ?? s.stepType}</span>
                    <button onClick={() => removeStep(s.key)} className="shrink-0 rounded px-1.5 text-xs text-red-500 hover:bg-red-50">✕</button>
                  </div>

                  {s.selector !== undefined && (
                    <input value={s.selector ?? ""} onChange={e => setStep(s.key, { selector: e.target.value })} placeholder="selector"
                      className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-500 focus:border-blue-400 focus:outline-none" />
                  )}

                  {fillable && (
                    <>
                      <div className="mt-1.5 flex items-center gap-1.5">
                        {bound ? (
                          <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md border border-emerald-300 bg-white px-2 py-1">
                            <span className="shrink-0 text-xs">🪪</span>
                            <span className="truncate text-xs font-bold text-emerald-700">{curVar?.label ?? bindingKey(s.inputValue)}</span>
                            <span className="ml-auto shrink-0 font-mono text-[10px] text-slate-400">{`{{${bindingKey(s.inputValue)}}}`}</span>
                          </div>
                        ) : (
                          <input value={s.inputValue ?? ""} onChange={e => setStep(s.key, { inputValue: e.target.value })}
                            placeholder="Giá trị cố định, hoặc gắn dữ liệu →"
                            className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
                        )}
                        {vars.length > 0 && (
                          <VarPicker step={s} vars={vars}
                            onPick={(k) => setStep(s.key, { inputValue: `{{${k}}}` })}
                            onClear={() => setStep(s.key, { inputValue: s.sampleValue ?? "" })} />
                        )}
                        <button onClick={() => fillField(s)} title="Điền thử lên trang để xem trước"
                          className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-700">Điền</button>
                      </div>
                      {bound && s.sampleValue && (
                        <p className="mt-1 pl-1 text-[10px] text-slate-400">Giá trị đã ghi: <span className="font-medium text-slate-500">{s.sampleValue}</span> · khi chạy sẽ thay bằng dữ liệu công dân</p>
                      )}
                    </>
                  )}

                  {s.stepType === "DETECT_SUCCESS_TEXT" && (
                    <input value={s.assertText ?? ""} onChange={e => setStep(s.key, { assertText: e.target.value })}
                      placeholder="Text báo thành công, vd: tiếp nhận"
                      className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
                  )}
                  {s.stepType === "WAIT_VNEID_LOGIN" && (
                    <div className="mt-1.5 space-y-1.5">
                      <input value={s.waitFor ?? ""} onChange={e => setStep(s.key, { waitFor: e.target.value })}
                        placeholder="Selector báo ĐÃ đăng nhập (vd: a.logout, .user-name)"
                        className="w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] focus:border-blue-400 focus:outline-none" />
                      <input value={s.assertText ?? ""} onChange={e => setStep(s.key, { assertText: e.target.value })}
                        placeholder="hoặc text báo đã đăng nhập (vd: Đăng xuất)"
                        className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
                      <p className="text-[10px] text-slate-400">Để trống → tự đoán (rời URL đăng nhập / thấy “Đăng xuất”). Phát hiện thất bại sẽ chuyển sang thao tác tay.</p>
                    </div>
                  )}
                  {s.stepType === "OPEN_URL" && (
                    <input value={s.url ?? ""} onChange={e => setStep(s.key, { url: e.target.value })}
                      className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] focus:border-blue-400 focus:outline-none" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex gap-2 border-t border-slate-200 p-3">
            <button onClick={onExit} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
            <button onClick={openCopy} disabled={steps.length === 0}
              title="Sao chép kết quả dạng JSON để dán vào CMS (Nhập từ recorder)"
              className="rounded-xl border border-blue-300 bg-blue-50 px-4 py-2 text-sm font-bold text-blue-700 hover:bg-blue-100 disabled:opacity-50">
              📋 Copy sang CMS
            </button>
            <button onClick={save} disabled={saving || steps.length === 0}
              className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? "Đang lưu…" : `Lưu ${steps.length} bước`}
            </button>
          </div>
        </div>
      </div>
      {copyJson !== null && <CopyResultModal json={copyJson} onClose={() => setCopyJson(null)} />}
    </div>
  );
}

/* ── Copy-result modal (transfer recorded steps → CMS) ──────────── */
function CopyResultModal({ json, onClose }: { json: string; onClose: () => void }) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [copied, setCopied] = useState(false);
  useEffect(() => { taRef.current?.select(); }, []);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(json);
      setCopied(true);
    } catch {
      // Tauri WebView / insecure context: fall back to execCommand on the selection.
      taRef.current?.select();
      try { document.execCommand("copy"); setCopied(true); } catch { /* user copies manually */ }
    }
    setTimeout(() => setCopied(false), 1600);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6" onClick={onClose}>
      <div className="flex max-h-[80vh] w-full max-w-2xl flex-col rounded-2xl bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
        <h3 className="text-lg font-black text-slate-900">Copy kết quả sang CMS</h3>
        <p className="mt-1 text-sm text-slate-500">
          Sao chép đoạn JSON dưới đây, mở CMS → Quy trình → quy trình tương ứng → <b>Nhập từ recorder</b> rồi dán vào.
        </p>
        <textarea ref={taRef} readOnly value={json}
          className="mt-3 min-h-0 flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-[11px] text-slate-600 focus:outline-none" />
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Đóng</button>
          <button onClick={copy}
            className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${copied ? "bg-emerald-600" : "bg-blue-600 hover:bg-blue-700"}`}>
            {copied ? "✓ Đã copy" : "📋 Copy"}
          </button>
        </div>
      </div>
    </div>
  );
}
