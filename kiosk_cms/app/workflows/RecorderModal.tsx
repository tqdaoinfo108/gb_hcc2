"use client";

import { useEffect, useRef, useState, useCallback } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

/* A step being assembled in the recorder */
export interface RecStep {
  key: string;
  stepType: string;
  name: string;
  selector?: string;
  selectorType?: string;
  inputValue?: string;
  url?: string;
  waitFor?: string;
  assertText?: string;
  uploadField?: string;
  onFailure?: string;
  isInput?: boolean;
  isSelect?: boolean;
}

interface RecordedAction {
  kind: "open" | "click" | "fill" | "url";
  selector?: string;
  selectorType?: string;
  tag?: string;
  inputType?: string;
  isInput?: boolean;
  isSelect?: boolean;
  isCheckable?: boolean;
  text?: string;
  name?: string;
  placeholder?: string;
  href?: string;
  url?: string;
  value?: string;
}

let keySeq = 0;
const nextKey = () => `s${++keySeq}_${Date.now()}`;

/* Manual (no-selector) semantic steps the admin can drop in */
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

function actionToStep(a: RecordedAction): RecStep | null {
  if (a.kind === "open") return { key: nextKey(), stepType: "OPEN_URL", name: "Mở cổng dịch vụ công", url: a.url };
  if (a.kind === "click") {
    if (a.isInput) {
      return { key: nextKey(), stepType: "INPUT_FIELD", name: `Điền: ${a.placeholder || a.name || a.text || "ô nhập"}`.slice(0, 60), selector: a.selector, selectorType: a.selectorType, inputValue: "", isInput: true };
    }
    if (a.isSelect) {
      return { key: nextKey(), stepType: "SELECT_OPTION", name: `Chọn: ${a.name || a.text || "dropdown"}`.slice(0, 60), selector: a.selector, selectorType: a.selectorType, inputValue: "", isSelect: true };
    }
    const label = a.text ? `Bấm: ${a.text}` : "Bấm phần tử";
    return { key: nextKey(), stepType: a.text && (a.tag === "a" || a.tag === "button") ? "CLICK_MENU" : "CLICK", name: label.slice(0, 60), selector: a.selector, selectorType: a.selectorType };
  }
  return null;
}

export function RecorderModal({
  templateId, targetUrl, onClose, onSaved,
}: { templateId: string; targetUrl: string; onClose: () => void; onSaved: () => void }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [steps, setSteps] = useState<RecStep[]>([]);
  const [currentUrl, setCurrentUrl] = useState(targetUrl);
  const [hasFrame, setHasFrame] = useState(false);
  const [status, setStatus] = useState<"starting" | "live" | "error">("starting");
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const seqRef = useRef(0);

  const setStep = (key: string, patch: Partial<RecStep>) =>
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));
  const removeStep = (key: string) => setSteps(prev => prev.filter(s => s.key !== key));
  const moveStep = (i: number, dir: -1 | 1) =>
    setSteps(prev => {
      const n = [...prev]; const j = i + dir;
      if (j < 0 || j >= n.length) return prev;
      [n[i], n[j]] = [n[j], n[i]]; return n;
    });

  /* Start the record session + connect to the CMS realtime channel */
  useEffect(() => {
    let socket: { disconnect: () => void } | null = null;
    let disposed = false;

    (async () => {
      try {
        const res = await fetch(`${API_URL}/selenium/templates/${templateId}/record`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: targetUrl }),
        });
        if (!res.ok) throw new Error(await res.text());
        const data = await res.json();
        if (disposed) return;
        setJobId(data.jobId); jobIdRef.current = data.jobId;
        setStatus("live");

        const { io } = await import("socket.io-client");
        socket = io(`${WS_URL}/cms`, { transports: ["websocket", "polling"] });
        const s = socket as ReturnType<typeof io>;
        s.on("selenium:screenshot", (d: { jobId: string; screenshotUrl: string; pageUrl?: string }) => {
          if (d.jobId !== jobIdRef.current) return;
          const url = `${API_URL}${d.screenshotUrl}?t=${Date.now()}`;
          const seq = ++seqRef.current;
          const loader = new Image();
          loader.onload = () => { if (seq === seqRef.current && imgRef.current) { imgRef.current.src = url; setHasFrame(true); } };
          loader.src = url;
          if (d.pageUrl) setCurrentUrl(d.pageUrl);
        });
        s.on("selenium:record_url", (d: { jobId: string; url: string }) => {
          if (d.jobId === jobIdRef.current && d.url) setCurrentUrl(d.url);
        });
        s.on("selenium:recorded", (d: { jobId: string; action: RecordedAction }) => {
          if (d.jobId !== jobIdRef.current) return;
          const a = d.action;
          if (a.kind === "fill") {
            // attach value to the most recent INPUT step with this selector
            setSteps(prev => {
              for (let i = prev.length - 1; i >= 0; i--) {
                if (prev[i].selector === a.selector && (prev[i].stepType === "INPUT_FIELD" || prev[i].stepType === "SELECT_OPTION")) {
                  const n = [...prev]; n[i] = { ...n[i], inputValue: a.value ?? "" }; return n;
                }
              }
              return prev;
            });
            return;
          }
          if (a.kind === "open") {
            setSteps(prev => (prev.some(s2 => s2.stepType === "OPEN_URL") ? prev : [actionToStep(a)!, ...prev]));
            return;
          }
          const step = actionToStep(a);
          if (step) setSteps(prev => [...prev, step]);
        });
      } catch (e) {
        if (!disposed) setStatus("error");
        console.error("recorder start failed", e);
      }
    })();

    return () => {
      disposed = true;
      if (jobIdRef.current) {
        fetch(`${API_URL}/selenium/jobs/${jobIdRef.current}/interact`, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: "finish" }),
        }).catch(() => {});
      }
      socket?.disconnect();
    };
  }, [templateId, targetUrl]);

  const send = useCallback((body: Record<string, unknown>) => {
    if (!jobIdRef.current) return;
    fetch(`${API_URL}/selenium/jobs/${jobIdRef.current}/interact`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }).catch(() => {});
  }, []);

  /* Map a click on the live frame to runner viewport coords (1366×900, objectFit:contain) */
  function onFrameClick(e: React.MouseEvent<HTMLImageElement>) {
    const img = imgRef.current; if (!img) return;
    const rect = img.getBoundingClientRect();
    const natW = img.naturalWidth || 1366, natH = img.naturalHeight || 900;
    const scale = Math.min(rect.width / natW, rect.height / natH); if (!scale) return;
    const offX = (rect.width - natW * scale) / 2, offY = (rect.height - natH * scale) / 2;
    const x = (e.clientX - rect.left - offX) / scale, y = (e.clientY - rect.top - offY) / scale;
    if (x < 0 || y < 0 || x > natW || y > natH) return;
    send({ type: "click", x: Math.round(x), y: Math.round(y) });
  }

  const addManual = (m: { stepType: string; name: string }) =>
    setSteps(prev => [...prev, { key: nextKey(), stepType: m.stepType, name: m.name, onFailure: m.stepType === "WAIT_VNEID_LOGIN" ? "STOP" : "STOP" }]);

  const fillField = (s: RecStep) => {
    if (!s.selector) return;
    send({ type: "fill", selector: s.selector, selectorType: s.selectorType, text: s.inputValue ?? "" });
  };

  async function save() {
    setSaving(true);
    try {
      const payload = steps.map(s => ({
        stepType: s.stepType, name: s.name, selector: s.selector, selectorType: s.selectorType,
        inputValue: s.inputValue, url: s.url, waitFor: s.waitFor, assertText: s.assertText,
        uploadField: s.uploadField, onFailure: s.onFailure ?? "STOP",
      }));
      const res = await fetch(`${API_URL}/selenium/templates/${templateId}/steps`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: payload }),
      });
      if (!res.ok) throw new Error(await res.text());
      onSaved();
    } catch (e) {
      alert("Lưu thất bại: " + (e instanceof Error ? e.message : String(e)));
    } finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900/70 p-4">
      <div className="flex min-h-0 flex-1 overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* ── Left: live browser ─────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col border-r border-slate-200">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
            <span className="flex items-center gap-2 text-sm font-bold text-red-600">
              <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" /> ĐANG GHI
            </span>
            <div className="flex-1 truncate rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs text-slate-500">
              {currentUrl.replace(/^https?:\/\//, "")}
            </div>
            <span className="text-xs text-slate-400">Chạm vào trang để ghi thao tác</span>
          </div>
          <div className="relative flex-1 overflow-hidden bg-white">
            <img
              ref={imgRef}
              alt="Live portal"
              onClick={onFrameClick}
              onWheel={e => { e.preventDefault(); send({ type: "scroll", deltaY: e.deltaY, deltaX: e.deltaX }); }}
              draggable={false}
              className="absolute inset-0 h-full w-full"
              style={{ objectFit: "contain", objectPosition: "top", cursor: "crosshair", opacity: hasFrame ? 1 : 0 }}
            />
            {!hasFrame && (
              <div className="flex h-full w-full flex-col items-center justify-center gap-3 text-slate-400">
                <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-blue-500" />
                <p className="text-sm font-semibold">
                  {status === "error" ? "Không kết nối được runner. Kiểm tra runner đang chạy." : "Đang mở trang trên runner…"}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* ── Right: recorded steps ──────────────────────────── */}
        <div className="flex w-[420px] flex-col">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <h3 className="font-black text-slate-900">Các bước đã ghi ({steps.length})</h3>
            <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100">✕ Đóng</button>
          </div>

          {/* Manual insert toolbar */}
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
              </div>
            )}
            {steps.map((s, i) => (
              <div key={s.key} className="rounded-xl border border-slate-200 p-2.5">
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
                  <input value={s.selector ?? ""} onChange={e => setStep(s.key, { selector: e.target.value })}
                    placeholder="selector"
                    className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] text-slate-500 focus:border-blue-400 focus:outline-none" />
                )}

                {(s.stepType === "INPUT_FIELD" || s.stepType === "SELECT_OPTION" || s.stepType === "SEARCH_PROCEDURE") && (
                  <div className="mt-1.5 flex gap-1.5">
                    <input value={s.inputValue ?? ""} onChange={e => setStep(s.key, { inputValue: e.target.value })}
                      placeholder="Giá trị (vd {{citizen.fullName}})"
                      className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
                    <button onClick={() => fillField(s)} title="Điền thử lên trang để xem trước"
                      className="shrink-0 rounded-md bg-blue-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-blue-700">Điền</button>
                  </div>
                )}

                {s.stepType === "DETECT_SUCCESS_TEXT" && (
                  <input value={s.assertText ?? ""} onChange={e => setStep(s.key, { assertText: e.target.value })}
                    placeholder="Text báo thành công, vd: tiếp nhận"
                    className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 text-xs focus:border-blue-400 focus:outline-none" />
                )}
                {s.stepType === "OPEN_URL" && (
                  <input value={s.url ?? ""} onChange={e => setStep(s.key, { url: e.target.value })}
                    className="mt-1.5 w-full rounded-md border border-slate-200 px-2 py-1 font-mono text-[11px] focus:border-blue-400 focus:outline-none" />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 border-t border-slate-200 p-3">
            <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
            <button onClick={save} disabled={saving || steps.length === 0}
              className="flex-1 rounded-xl bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700 disabled:opacity-50">
              {saving ? "Đang lưu…" : `Lưu ${steps.length} bước vào quy trình`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
