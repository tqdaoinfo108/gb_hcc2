"use client";

import { useCallback, useEffect, useState } from "react";
import { auditHeaders } from "../lib/audit-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? API_URL;

/* ── Types ─────────────────────────────────────────────── */
interface Location { id: string; name: string; code: string }
interface Release {
  id: string; version: string; channel: string; notes: string | null;
  isMandatory: boolean; rolloutPercent: number; status: string;
  scheduledAt: string | null; autoRollback: boolean; failureThreshold: number;
  targetLocationId: string | null; targetLocation: { id: string; name: string } | null;
  fileName: string | null; fileSize: number | null; sha256: string | null;
  createdByName: string | null; createdAt: string;
  stats?: Record<string, number>;
}
interface DeviceRow {
  id: string; name: string | null; serialNumber: string; appVersion: string | null;
  lastHeartbeat: string | null;
  location: { id: string; name: string } | null;
  latestUpdate: { status: string; toVersion?: string; progress: number } | null;
}

/* ── API helpers ───────────────────────────────────────── */
const H = () => ({ "Content-Type": "application/json", ...auditHeaders() });
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { headers: H(), cache: "no-store", ...init });
  if (!res.ok) throw new Error((await res.text().catch(() => "")) || `HTTP ${res.status}`);
  return res.status === 204 ? (undefined as T) : (res.json() as Promise<T>);
}

/* ── Status styling ────────────────────────────────────── */
function relStatusTone(s: string): { bg: string; fg: string; label: string } {
  switch (s) {
    case "DRAFT": return { bg: "#f1f5f9", fg: "#475569", label: "Nháp" };
    case "ROLLING": return { bg: "#dbeafe", fg: "#1d4ed8", label: "Đang triển khai" };
    case "PAUSED": return { bg: "#fef3c7", fg: "#b45309", label: "Tạm dừng" };
    case "COMPLETED": return { bg: "#dcfce7", fg: "#15803d", label: "Hoàn tất" };
    case "ROLLED_BACK": return { bg: "#fee2e2", fg: "#b91c1c", label: "Đã thu hồi" };
    default: return { bg: "#f1f5f9", fg: "#475569", label: s };
  }
}
function updStatusTone(s: string): { bg: string; fg: string } {
  switch (s) {
    case "INSTALLED": return { bg: "#dcfce7", fg: "#15803d" };
    case "FAILED": return { bg: "#fee2e2", fg: "#b91c1c" };
    case "DOWNLOADING": case "INSTALLING": case "DOWNLOADED": return { bg: "#dbeafe", fg: "#1d4ed8" };
    case "NOTIFIED": case "PENDING": return { bg: "#f1f5f9", fg: "#64748b" };
    default: return { bg: "#f1f5f9", fg: "#64748b" };
  }
}
function fmtBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "vừa xong";
  if (s < 3600) return `${Math.floor(s / 60)} phút trước`;
  if (s < 86400) return `${Math.floor(s / 3600)} giờ trước`;
  return `${Math.floor(s / 86400)} ngày trước`;
}

/* ═══════════════════════════════════════════════════════ */
export function OtaClient({ matrixLocationId }: { matrixLocationId: string | null }) {
  const [tab, setTab] = useState<"releases" | "devices">("releases");
  const [releases, setReleases] = useState<Release[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const loadReleases = useCallback(() => api<Release[]>("/ota/releases").then(setReleases).catch(() => {}), []);
  const loadLocations = useCallback(() => api<Location[]>("/ota/locations").then(setLocations).catch(() => {}), []);
  const loadDevices = useCallback(
    () => api<DeviceRow[]>(`/ota/devices${matrixLocationId ? `?locationId=${matrixLocationId}` : ""}`).then(setDevices).catch(() => {}),
    [matrixLocationId],
  );

  useEffect(() => { void loadReleases(); void loadLocations(); void loadDevices(); }, [loadReleases, loadLocations, loadDevices]);

  useEffect(() => {
    let socket: { on: (e: string, cb: (...a: never[]) => void) => void; disconnect: () => void } | null = null;
    let disposed = false;
    import("socket.io-client").then(({ io }) => {
      if (disposed) return;
      const s = io(`${WS_URL}/cms`, { transports: ["websocket", "polling"] });
      socket = s as never;
      s.on("ota:update_progress", () => { void loadReleases(); void loadDevices(); });
      s.on("ota:release_updated", () => void loadReleases());
      s.on("ota:auto_stopped", (p: { version?: string; failureRate?: number }) => {
        showToast(`Tự động dừng triển khai v${p?.version ?? ""} — tỉ lệ lỗi ${p?.failureRate ?? "?"}%`);
        void loadReleases();
      });
    });
    return () => { disposed = true; socket?.disconnect(); };
  }, [loadReleases, loadDevices]);

  /* ── Release actions ── */
  const setStatus = async (r: Release, status: string) => {
    setBusy(`status-${r.id}`);
    try {
      await api(`/ota/releases/${r.id}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
      showToast(`Đã cập nhật trạng thái v${r.version}`);
      await loadReleases();
    } catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };
  const removeRelease = async (r: Release) => {
    if (!confirm(`Xoá / thu hồi bản phát hành v${r.version}?`)) return;
    setBusy(`del-${r.id}`);
    try { await api(`/ota/releases/${r.id}`, { method: "DELETE" }); showToast(`Đã xoá v${r.version}`); await loadReleases(); }
    catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };
  const updateRollout = async (r: Release, rolloutPercent: number) => {
    try { await api(`/ota/releases/${r.id}`, { method: "PATCH", body: JSON.stringify({ rolloutPercent }) }); await loadReleases(); }
    catch (e) { showToast(`Lỗi: ${e instanceof Error ? e.message : e}`); }
  };
  const uploadPackage = async (r: Release, file: File) => {
    setBusy(`pkg-${r.id}`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`${API_URL}/ota/releases/${r.id}/package`, { method: "POST", headers: auditHeaders(), body: fd });
      if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
      showToast(`Đã tải gói cho v${r.version}`);
      await loadReleases();
    } catch (e) { showToast(`Lỗi tải gói: ${e instanceof Error ? e.message : e}`); }
    finally { setBusy(null); }
  };

  const installedCount = (r: Release) => r.stats?.INSTALLED ?? 0;
  const failedCount = (r: Release) => r.stats?.FAILED ?? 0;
  const targetedCount = (r: Release) => Object.values(r.stats ?? {}).reduce((a, b) => a + b, 0);

  return (
    <div>
      {toast && (
        <div className="fixed right-6 top-6 z-50 max-w-md rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">{toast}</div>
      )}

      {/* Tabs */}
      <div className="mb-5 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit">
        {([["releases", "Phát hành"], ["devices", "Phiên bản thiết bị"]] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            className={`rounded-lg px-4 py-2 text-sm font-bold transition ${tab === k ? "bg-white text-[#0068B7] shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Releases ── */}
      {tab === "releases" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={() => setShowCreate(true)} className="rounded-xl bg-[#0068B7] px-4 py-2 text-sm font-bold text-white hover:bg-[#005599]">
              + Tạo bản phát hành
            </button>
          </div>
          {releases.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
              Chưa có bản phát hành. Tạo bản đầu tiên và tải lên gói cài đặt (.msi).
            </div>
          ) : releases.map((r) => {
            const tone = relStatusTone(r.status);
            const targeted = targetedCount(r);
            const installed = installedCount(r);
            const pct = targeted > 0 ? Math.round((installed / targeted) * 100) : 0;
            return (
              <div key={r.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">v{r.version}</h3>
                      <span className="rounded-full px-2.5 py-0.5 text-xs font-bold" style={{ background: tone.bg, color: tone.fg }}>{tone.label}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">{r.channel}</span>
                      {r.isMandatory && <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">Bắt buộc</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">
                      {r.targetLocation ? `Địa điểm: ${r.targetLocation.name}` : "Tất cả địa điểm"} • {r.fileName ? `${r.fileName} (${fmtBytes(r.fileSize)})` : "chưa có gói"}
                      {r.createdByName ? ` • bởi ${r.createdByName}` : ""} • {relTime(r.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {!r.fileName && (
                      <label className={`cursor-pointer rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 ${busy === `pkg-${r.id}` ? "opacity-50" : ""}`}>
                        {busy === `pkg-${r.id}` ? "Đang tải…" : "Tải gói .msi"}
                        <input type="file" accept=".msi,.exe,application/octet-stream" className="hidden"
                          onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadPackage(r, f); e.target.value = ""; }} />
                      </label>
                    )}
                    {(r.status === "DRAFT" || r.status === "PAUSED") && r.fileName && (
                      <button onClick={() => setStatus(r, "ROLLING")} disabled={!!busy} className="rounded-xl bg-blue-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50">▶ Triển khai</button>
                    )}
                    {r.status === "ROLLING" && (
                      <>
                        <button onClick={() => setStatus(r, "PAUSED")} disabled={!!busy} className="rounded-xl bg-amber-100 px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-200 disabled:opacity-50">⏸ Tạm dừng</button>
                        <button onClick={() => setStatus(r, "COMPLETED")} disabled={!!busy} className="rounded-xl bg-green-100 px-3 py-1.5 text-xs font-bold text-green-700 hover:bg-green-200 disabled:opacity-50">✓ Hoàn tất</button>
                      </>
                    )}
                    {r.status !== "ROLLED_BACK" && (
                      <button onClick={() => setStatus(r, "ROLLED_BACK")} disabled={!!busy} className="rounded-xl bg-red-50 px-3 py-1.5 text-xs font-bold text-red-700 hover:bg-red-100 disabled:opacity-50">↩ Thu hồi</button>
                    )}
                    <button onClick={() => removeRelease(r)} disabled={!!busy} className="rounded-xl px-3 py-1.5 text-xs font-bold text-slate-400 hover:bg-slate-100 disabled:opacity-50">Xoá</button>
                  </div>
                </div>

                {r.notes && <p className="mt-3 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">{r.notes}</p>}

                {/* Rollout progress + control */}
                <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-[1fr_220px]">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span>Tiến độ cài đặt: <b className="text-slate-700">{installed}/{targeted}</b> thiết bị {failedCount(r) > 0 && <span className="text-red-600">• {failedCount(r)} lỗi</span>}</span>
                      <span>{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-semibold text-slate-500">Tỉ lệ canary: <b className="text-[#0068B7]">{r.rolloutPercent}%</b></label>
                    <input type="range" min={0} max={100} step={5} defaultValue={r.rolloutPercent}
                      onMouseUp={(e) => updateRollout(r, Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => updateRollout(r, Number((e.target as HTMLInputElement).value))}
                      className="w-full accent-[#0068B7]" disabled={r.status === "ROLLED_BACK"} />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Device matrix ── */}
      {tab === "devices" && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs text-slate-500">
              <tr>
                <th className="px-4 py-3">Thiết bị</th>
                <th className="px-4 py-3">Địa điểm</th>
                <th className="px-4 py-3">Phiên bản</th>
                <th className="px-4 py-3">Cập nhật gần nhất</th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">Chưa có thiết bị.</td></tr>}
              {devices.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-800">{d.name || d.serialNumber}</div>
                    <div className="font-mono text-[11px] text-slate-400">{d.serialNumber}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{d.location?.name ?? "—"}</td>
                  <td className="px-4 py-3"><span className="rounded-lg bg-slate-100 px-2 py-1 font-mono text-xs font-bold text-slate-700">{d.appVersion ?? "—"}</span></td>
                  <td className="px-4 py-3">
                    {d.latestUpdate ? (
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: updStatusTone(d.latestUpdate.status).bg, color: updStatusTone(d.latestUpdate.status).fg }}>
                        {d.latestUpdate.status}{d.latestUpdate.toVersion ? ` → v${d.latestUpdate.toVersion}` : ""}
                        {["DOWNLOADING", "INSTALLING"].includes(d.latestUpdate.status) ? ` ${d.latestUpdate.progress}%` : ""}
                      </span>
                    ) : <span className="text-xs text-slate-400">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create release modal */}
      {showCreate && (
        <CreateReleaseModal
          locations={locations}
          onClose={() => setShowCreate(false)}
          onCreated={async () => { setShowCreate(false); await loadReleases(); showToast("Đã tạo bản phát hành. Hãy tải gói .msi và triển khai."); }}
        />
      )}
    </div>
  );
}

/* ── Create release modal ──────────────────────────────── */
function CreateReleaseModal({ locations, onClose, onCreated }: { locations: Location[]; onClose: () => void; onCreated: () => void }) {
  const [f, setF] = useState({
    version: "", channel: "STABLE", notes: "", isMandatory: false,
    rolloutPercent: 100, targetLocationId: "", scheduledAt: "", failureThreshold: 20,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async () => {
    if (!f.version.trim()) { setErr("Nhập số phiên bản (VD: 1.1.0)"); return; }
    setSaving(true); setErr(null);
    try {
      await api("/ota/releases", { method: "POST", body: JSON.stringify({
        version: f.version.trim(), channel: f.channel, notes: f.notes || undefined,
        isMandatory: f.isMandatory, rolloutPercent: f.rolloutPercent,
        targetLocationId: f.targetLocationId || null,
        scheduledAt: f.scheduledAt || undefined, failureThreshold: f.failureThreshold,
      }) });
      onCreated();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-4 text-lg font-black text-slate-900">Tạo bản phát hành</h3>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Phiên bản *</label>
              <input value={f.version} onChange={(e) => setF({ ...f, version: e.target.value })} placeholder="1.1.0" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Kênh</label>
              <select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none">
                <option value="STABLE">STABLE</option><option value="BETA">BETA</option>
              </select>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-slate-600">Ghi chú phát hành</label>
            <textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} rows={2} placeholder="Tính năng mới, sửa lỗi…" className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Địa điểm mục tiêu</label>
              <select value={f.targetLocationId} onChange={(e) => setF({ ...f, targetLocationId: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none">
                <option value="">Tất cả địa điểm</option>
                {locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Tỉ lệ canary ban đầu: {f.rolloutPercent}%</label>
              <input type="range" min={0} max={100} step={5} value={f.rolloutPercent} onChange={(e) => setF({ ...f, rolloutPercent: Number(e.target.value) })} className="w-full accent-[#0068B7]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Lên lịch (tuỳ chọn)</label>
              <input type="datetime-local" value={f.scheduledAt} onChange={(e) => setF({ ...f, scheduledAt: e.target.value })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-slate-600">Ngưỡng tự dừng (% lỗi)</label>
              <input type="number" min={1} max={100} value={f.failureThreshold} onChange={(e) => setF({ ...f, failureThreshold: Number(e.target.value) })} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-[#0068B7] focus:outline-none" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={f.isMandatory} onChange={(e) => setF({ ...f, isMandatory: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
            Cập nhật bắt buộc (kiosk phải cập nhật ngay khi rảnh)
          </label>
          {err && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{err}</p>}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50">Huỷ</button>
          <button onClick={submit} disabled={saving} className="rounded-xl bg-[#0068B7] px-4 py-2 text-sm font-bold text-white hover:bg-[#005599] disabled:opacity-50">{saving ? "Đang tạo…" : "Tạo bản phát hành"}</button>
        </div>
      </div>
    </div>
  );
}
