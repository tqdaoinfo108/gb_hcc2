"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { auditHeaders } from "../lib/audit-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? API_URL;

/* ── Types (mirror /remote/devices shape) ─────────────────── */
interface Metrics {
  cpu: number | null; memory: number | null; disk: number | null;
  temperature: number | null; latency: number | null; currentScreen: string | null; at?: string;
}
interface Component { type: string; name: string; status: string; lastChecked: string | null }
interface Device {
  id: string; deviceId: string; serialNumber: string; name: string | null; placement: string | null;
  isEnabled: boolean; status: string; online: boolean; maintenanceMessage: string | null;
  model: string | null; firmwareVersion: string | null; appVersion: string | null;
  ipAddress: string | null; macAddress: string | null; lastHeartbeat: string | null;
  location: { id: string; name: string; code: string } | null;
  metrics: Metrics | null; components: Component[];
}
interface ActionRow { id: string; command: string; payload: unknown; result: string | null; at: string }
interface Detail extends Device {
  healthHistory: { at: string; cpu: number | null; memory: number | null; disk: number | null; temperature: number | null; latency: number | null; screen: string | null }[];
  actions: ActionRow[];
  sessions: { id: string; status: string; startTime: string; endTime: string | null; currentScreen: string | null }[];
}
interface CmdResult { command: string; status: string; result: string | null; artifact: string | null; at: string }

/* ── Command catalogue ────────────────────────────────────── */
type Tone = "default" | "warn" | "danger";
interface CmdDef { cmd: string; label: string; icon: string; tone: Tone; confirm?: boolean; message?: boolean; nativeOnly?: boolean }
const COMMAND_GROUPS: { title: string; items: CmdDef[] }[] = [
  { title: "Ứng dụng & phiên", items: [
    { cmd: "RELOAD", label: "Tải lại ứng dụng", icon: "🔄", tone: "default" },
    { cmd: "GOTO_IDLE", label: "Về màn hình chờ", icon: "🏠", tone: "default" },
  ]},
  { title: "Chẩn đoán", items: [
    { cmd: "PING", label: "Kiểm tra kết nối", icon: "📡", tone: "default" },
    { cmd: "DIAGNOSTICS", label: "Chẩn đoán", icon: "🩺", tone: "default" },
    { cmd: "COLLECT_LOGS", label: "Thu thập log", icon: "📋", tone: "default" },
    { cmd: "SCREENSHOT", label: "Chụp màn hình", icon: "📸", tone: "default" },
  ]},
  { title: "Bảo trì", items: [
    { cmd: "MAINTENANCE_ON", label: "Bật bảo trì", icon: "🛠️", tone: "warn", confirm: true, message: true },
    { cmd: "MAINTENANCE_OFF", label: "Tắt bảo trì", icon: "✅", tone: "default" },
  ]},
  { title: "Nguồn thiết bị", items: [
    { cmd: "REBOOT", label: "Khởi động lại máy", icon: "♻️", tone: "danger", confirm: true, nativeOnly: true },
    { cmd: "SHUTDOWN", label: "Tắt máy", icon: "⏻", tone: "danger", confirm: true, nativeOnly: true },
  ]},
];
const CMD_LABEL: Record<string, string> = Object.fromEntries(
  COMMAND_GROUPS.flatMap((g) => g.items.map((i) => [i.cmd, i.label])),
);

/* ── Helpers ──────────────────────────────────────────────── */
function relTime(iso: string | null): string {
  if (!iso) return "chưa có";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "vừa xong";
  if (s < 60) return `${s} giây trước`;
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}
function metricTone(v: number | null): string {
  if (v == null) return "#cbd5e1";
  if (v >= 85) return "#dc2626";
  if (v >= 70) return "#f59e0b";
  return "#16a34a";
}
function statusDot(d: Device): string {
  if (!d.isEnabled || d.status === "MAINTENANCE") return "#f59e0b";
  return d.online ? "#16a34a" : "#94a3b8";
}
function statusText(d: Device): string {
  if (!d.isEnabled || d.status === "MAINTENANCE") return "Bảo trì";
  return d.online ? "Trực tuyến" : "Ngoại tuyến";
}
function compTone(status: string): { bg: string; fg: string } {
  switch (status) {
    case "OK": return { bg: "#dcfce7", fg: "#15803d" };
    case "WARNING": return { bg: "#fef3c7", fg: "#b45309" };
    case "ERROR": return { bg: "#fee2e2", fg: "#b91c1c" };
    default: return { bg: "#f1f5f9", fg: "#64748b" };
  }
}
function resultTone(r: string | null): { bg: string; fg: string } {
  switch (r) {
    case "SUCCESS": return { bg: "#dcfce7", fg: "#15803d" };
    case "DELIVERED": return { bg: "#dbeafe", fg: "#1d4ed8" };
    case "QUEUED": return { bg: "#f1f5f9", fg: "#475569" };
    case "FAILED": return { bg: "#fee2e2", fg: "#b91c1c" };
    case "DEVICE_OFFLINE": return { bg: "#fef3c7", fg: "#b45309" };
    case "UNSUPPORTED": return { bg: "#ede9fe", fg: "#6d28d9" };
    default: return { bg: "#f1f5f9", fg: "#475569" };
  }
}

/* ── Component ─────────────────────────────────────────────── */
export function RemoteDebugClient({ initialDevices }: { initialDevices: Device[]; isSuperAdmin: boolean }) {
  const [devices, setDevices] = useState<Device[]>(initialDevices);
  const [selectedId, setSelectedId] = useState<string | null>(initialDevices[0]?.id ?? null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<CmdResult | null>(null);
  const [confirmCmd, setConfirmCmd] = useState<CmdDef | null>(null);
  const [maintMsg, setMaintMsg] = useState("");
  const [live, setLive] = useState(false);
  const [filter, setFilter] = useState("");

  const selectedIdRef = useRef(selectedId);
  useEffect(() => { selectedIdRef.current = selectedId; }, [selectedId]);

  const loadDetail = useCallback(async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/remote/devices/${id}`, { headers: { ...auditHeaders() }, cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as Detail;
      if (selectedIdRef.current === id) setDetail(data);
    } catch { /* transient */ }
  }, []);

  // Load detail when selection changes.
  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setDetail(null);
    setLastResult(null);
    void loadDetail(selectedId);
  }, [selectedId, loadDetail]);

  // Poll the selected device's detail as a fallback to the live socket.
  useEffect(() => {
    if (!selectedId) return;
    const t = setInterval(() => void loadDetail(selectedId), 10_000);
    return () => clearInterval(t);
  }, [selectedId, loadDetail]);

  // Live updates over the CMS socket namespace.
  useEffect(() => {
    let socket: { on: (e: string, cb: (...a: never[]) => void) => void; disconnect: () => void } | null = null;
    let disposed = false;
    const patch = (match: (d: Device) => boolean, next: Partial<Device>) =>
      setDevices((list) => list.map((d) => (match(d) ? { ...d, ...next } : d)));

    import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      const s = io(`${WS_URL}/cms`, { transports: ["websocket", "polling"] });
      socket = s as never;
      s.on("connect", () => setLive(true));
      s.on("disconnect", () => setLive(false));

      s.on("device:health", (p: { id?: string; deviceId?: string; serialNumber?: string; status?: string; online?: boolean; lastHeartbeat?: string; appVersion?: string | null; ipAddress?: string | null; metrics?: Metrics }) => {
        patch(
          (d) => d.id === p.id || d.deviceId === p.deviceId || d.serialNumber === p.serialNumber || d.serialNumber === p.deviceId,
          {
            online: p.online ?? undefined,
            status: p.status ?? undefined,
            lastHeartbeat: p.lastHeartbeat ?? undefined,
            appVersion: p.appVersion ?? undefined,
            ipAddress: p.ipAddress ?? undefined,
            metrics: p.metrics ? { ...p.metrics } : undefined,
          },
        );
      });
      const onPresence = (online: boolean) => (p: { deviceId?: string }) =>
        patch((d) => d.deviceId === p.deviceId || d.serialNumber === p.deviceId, { online, status: online ? "ONLINE" : "OFFLINE" });
      s.on("device:online", onPresence(true));
      s.on("device:offline", onPresence(false));

      const onCmd = (p: { deviceId?: string; command?: string; status?: string; result?: string | null; artifact?: string | null; at?: string }) => {
        if (p.deviceId && p.deviceId === selectedIdRef.current) {
          if (p.status) {
            setLastResult({
              command: p.command ?? "?", status: p.status,
              result: p.result ?? null, artifact: p.artifact ?? null, at: p.at ?? new Date().toISOString(),
            });
          }
          void loadDetail(selectedIdRef.current);
        }
      };
      s.on("command:issued", onCmd);
      s.on("command:result", onCmd);
      s.on("device:config_updated", () => {
        if (selectedIdRef.current) void loadDetail(selectedIdRef.current);
      });
    });

    return () => { disposed = true; socket?.disconnect(); };
  }, [loadDetail]);

  const dispatch = useCallback(async (def: CmdDef, message?: string) => {
    const id = selectedIdRef.current;
    if (!id) return;
    setBusy(def.cmd);
    try {
      const res = await fetch(`${API_URL}/remote/devices/${id}/command`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auditHeaders() },
        body: JSON.stringify({ command: def.cmd, payload: message ? { message } : {} }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLastResult({ command: def.cmd, status: "FAILED", result: data?.message ?? `HTTP ${res.status}`, artifact: null, at: new Date().toISOString() });
      } else {
        setLastResult({ command: def.cmd, status: data.status ?? "QUEUED", result: data.delivered ? "Đã gửi tới thiết bị, chờ phản hồi…" : null, artifact: null, at: new Date().toISOString() });
      }
      void loadDetail(id);
    } catch (e) {
      setLastResult({ command: def.cmd, status: "FAILED", result: e instanceof Error ? e.message : String(e), artifact: null, at: new Date().toISOString() });
    } finally {
      setBusy(null);
    }
  }, [loadDetail]);

  const onCommandClick = (def: CmdDef) => {
    if (def.confirm) { setConfirmCmd(def); setMaintMsg(""); return; }
    void dispatch(def);
  };

  const selected = useMemo(() => devices.find((d) => d.id === selectedId) ?? null, [devices, selectedId]);
  const view = detail ?? selected;

  const counts = useMemo(() => ({
    online: devices.filter((d) => d.isEnabled && d.online).length,
    offline: devices.filter((d) => d.isEnabled && !d.online).length,
    maint: devices.filter((d) => !d.isEnabled).length,
  }), [devices]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      [d.name, d.serialNumber, d.deviceId, d.location?.name, d.placement].filter(Boolean).some((v) => v!.toLowerCase().includes(q)));
  }, [devices, filter]);

  return (
    <div>
      {/* Summary + live indicator */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SummaryChip color="#16a34a" label="Trực tuyến" value={counts.online} />
        <SummaryChip color="#94a3b8" label="Ngoại tuyến" value={counts.offline} />
        <SummaryChip color="#f59e0b" label="Bảo trì" value={counts.maint} />
        <div className="ml-auto flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
          <span className={`h-2 w-2 rounded-full ${live ? "bg-green-500" : "bg-slate-300"}`} style={{ boxShadow: live ? "0 0 0 3px rgba(34,197,94,0.15)" : "none" }} />
          {live ? "Đang theo dõi thời gian thực" : "Mất kết nối realtime"}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[340px_1fr]">
        {/* Device list */}
        <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Tìm thiết bị, vị trí, serial…"
            className="mb-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none"
          />
          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
            {filtered.length === 0 && <p className="px-2 py-6 text-center text-sm text-slate-400">Không có thiết bị.</p>}
            {filtered.map((d) => {
              const active = d.id === selectedId;
              return (
                <button
                  key={d.id}
                  onClick={() => setSelectedId(d.id)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${active ? "border-[#0068B7]/40 bg-[#0068B7]/[0.06]" : "border-transparent hover:bg-slate-50"}`}
                >
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: statusDot(d) }} />
                    <span className={`min-w-0 flex-1 truncate text-sm font-bold ${active ? "text-[#0068B7]" : "text-slate-800"}`}>
                      {d.name || d.serialNumber}
                    </span>
                    <span className="shrink-0 text-[10px] font-semibold text-slate-400">{statusText(d)}</span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 pl-[18px] text-[11px] text-slate-400">
                    <span className="truncate">{d.location?.name ?? "—"}</span>
                    <span>•</span>
                    <span className="font-mono">{d.serialNumber}</span>
                  </div>
                  {d.metrics && (
                    <div className="mt-1.5 flex gap-1.5 pl-[18px]">
                      <MiniBar label="CPU" v={d.metrics.cpu} />
                      <MiniBar label="RAM" v={d.metrics.memory} />
                      <MiniBar label="Đĩa" v={d.metrics.disk} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Console */}
        {!view ? (
          <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-12 text-slate-400">
            Chọn một thiết bị để xem chi tiết và gửi lệnh.
          </div>
        ) : (
          <div className="space-y-5">
            {/* Header strip */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-3 w-3 rounded-full" style={{ background: statusDot(view) }} />
                    <h2 className="text-xl font-black text-slate-900">{view.name || view.serialNumber}</h2>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: `${statusDot(view)}1a`, color: statusDot(view) }}>
                      {statusText(view)}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {view.location?.name ?? "—"} {view.placement ? `• ${view.placement}` : ""}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500">
                  <div>Heartbeat: <b className="text-slate-700">{relTime(view.lastHeartbeat)}</b></div>
                  <div className="mt-0.5">Phiên bản: <b className="text-slate-700">{view.appVersion ?? view.firmwareVersion ?? "—"}</b></div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <Field label="Serial" value={view.serialNumber} mono />
                <Field label="Device ID" value={view.deviceId} mono />
                <Field label="IP" value={view.ipAddress ?? "—"} mono />
                <Field label="Màn hình" value={view.metrics?.currentScreen ?? "—"} />
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Gauge label="CPU" v={view.metrics?.cpu ?? null} unit="%" />
              <Gauge label="Bộ nhớ" v={view.metrics?.memory ?? null} unit="%" />
              <Gauge label="Ổ đĩa" v={view.metrics?.disk ?? null} unit="%" />
              <Gauge label="Nhiệt độ" v={view.metrics?.temperature ?? null} unit="°C" max={90} />
            </div>

            {/* Components */}
            {view.components.length > 0 && (
              <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Thiết bị ngoại vi</p>
                <div className="flex flex-wrap gap-2">
                  {view.components.map((c) => {
                    const t = compTone(c.status);
                    return (
                      <span key={c.type} className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{ background: t.bg, color: t.fg }}>
                        {c.name} • {c.status}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Command grid */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-400">Lệnh điều khiển</p>
              <div className="space-y-4">
                {COMMAND_GROUPS.map((g) => (
                  <div key={g.title}>
                    <p className="mb-2 text-xs font-semibold text-slate-500">{g.title}</p>
                    <div className="flex flex-wrap gap-2">
                      {g.items.map((it) => (
                        <button
                          key={it.cmd}
                          disabled={busy !== null}
                          onClick={() => onCommandClick(it)}
                          className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 ${toneClass(it.tone)}`}
                        >
                          <span>{it.icon}</span>
                          {busy === it.cmd ? "Đang gửi…" : it.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Last result + artifact */}
            {lastResult && (
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="mb-2 flex items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Kết quả gần nhất</p>
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: resultTone(lastResult.status).bg, color: resultTone(lastResult.status).fg }}>
                    {CMD_LABEL[lastResult.command] ?? lastResult.command} • {lastResult.status}
                  </span>
                  <span className="ml-auto text-[11px] text-slate-400">{relTime(lastResult.at)}</span>
                </div>
                {lastResult.artifact && lastResult.artifact.startsWith("data:image") ? (
                  <img src={lastResult.artifact} alt="screenshot" className="max-h-[420px] w-full rounded-xl border border-slate-200 object-contain" />
                ) : lastResult.artifact ? (
                  <pre className="max-h-[320px] overflow-auto rounded-xl bg-slate-900 p-4 text-[11px] leading-relaxed text-slate-100">{lastResult.artifact}</pre>
                ) : lastResult.result ? (
                  <pre className="max-h-[240px] overflow-auto whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-xs text-slate-600">{lastResult.result}</pre>
                ) : null}
              </div>
            )}

            {/* Command history */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-400">Lịch sử lệnh</p>
              {!detail || detail.actions.length === 0 ? (
                <p className="py-4 text-center text-sm text-slate-400">Chưa có lệnh nào.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-slate-100">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs text-slate-500">
                      <tr><th className="px-3 py-2">Lệnh</th><th className="px-3 py-2">Kết quả</th><th className="px-3 py-2">Thời gian</th></tr>
                    </thead>
                    <tbody>
                      {detail.actions.map((a) => (
                        <tr key={a.id} className="border-t border-slate-100">
                          <td className="px-3 py-2 font-semibold text-slate-700">{CMD_LABEL[a.command] ?? a.command}</td>
                          <td className="px-3 py-2">
                            <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: resultTone(a.result).bg, color: resultTone(a.result).fg }}>{a.result ?? "—"}</span>
                          </td>
                          <td className="px-3 py-2 text-xs text-slate-400">{relTime(a.at)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      {confirmCmd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setConfirmCmd(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-black text-slate-900">{confirmCmd.icon} {confirmCmd.label}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {confirmCmd.tone === "danger"
                ? `Lệnh này sẽ ${confirmCmd.cmd === "REBOOT" ? "khởi động lại" : "tắt"} thiết bị "${selected?.name || selected?.serialNumber}". Mọi phiên đang chạy sẽ kết thúc.`
                : `Bật chế độ bảo trì cho "${selected?.name || selected?.serialNumber}"? Kiosk sẽ ngừng phục vụ công dân cho tới khi tắt bảo trì.`}
            </p>
            {confirmCmd.nativeOnly && (
              <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                Lệnh nguồn chỉ hoạt động khi kiosk chạy bản desktop (Tauri). Bản web sẽ báo &quot;không hỗ trợ&quot;.
              </p>
            )}
            {confirmCmd.message && (
              <input
                value={maintMsg}
                onChange={(e) => setMaintMsg(e.target.value)}
                placeholder="Thông báo hiển thị trên màn hình bảo trì (tuỳ chọn)"
                className="mt-3 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none"
              />
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button onClick={() => setConfirmCmd(null)} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
              <button
                onClick={() => { const d = confirmCmd; setConfirmCmd(null); void dispatch(d, d.message ? maintMsg : undefined); }}
                className={`rounded-xl px-4 py-2 text-sm font-bold text-white ${confirmCmd.tone === "danger" ? "bg-red-600 hover:bg-red-700" : "bg-amber-500 hover:bg-amber-600"}`}
              >
                Xác nhận
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Small presentational pieces ──────────────────────────── */
function SummaryChip({ color, label, value }: { color: string; label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm">
      <span className="h-2.5 w-2.5 rounded-full" style={{ background: color }} />
      <span className="font-black text-slate-800">{value}</span>
      <span className="text-slate-500">{label}</span>
    </div>
  );
}
function MiniBar({ label, v }: { label: string; v: number | null }) {
  return (
    <div className="flex-1">
      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, v ?? 0)}%`, background: metricTone(v) }} />
      </div>
      <span className="text-[9px] text-slate-400">{label}</span>
    </div>
  );
}
function Gauge({ label, v, unit, max = 100 }: { label: string; v: number | null; unit: string; max?: number }) {
  const pct = v == null ? 0 : Math.min(100, (v / max) * 100);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-900">{v == null ? "—" : Math.round(v)}<span className="text-sm font-bold text-slate-400">{v == null ? "" : unit}</span></p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: metricTone(unit === "°C" ? (v == null ? null : (v / max) * 100) : v) }} />
      </div>
    </div>
  );
}
function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
      <p className={`truncate text-slate-700 ${mono ? "font-mono text-[11px]" : "text-xs"}`} title={value}>{value}</p>
    </div>
  );
}
function toneClass(tone: Tone): string {
  switch (tone) {
    case "danger": return "border-red-200 bg-red-50 text-red-700 hover:bg-red-100";
    case "warn": return "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100";
    default: return "border-slate-200 bg-white text-slate-700 hover:border-[#0068B7]/40 hover:bg-slate-50";
  }
}
