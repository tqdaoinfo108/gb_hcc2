"use client";
import { useState } from "react";
import { auditHeaders } from "../lib/audit-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";

/* ── Types ─────────────────────────────────────────────── */
interface HomeService {
  id: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
  icon: string | null;
  colorHex: string | null;
  bgColorHex: string | null;
  screenId: string;
  badge: string | null;
  sortOrder: number;
  isVisible: boolean;
}

/* ── Helpers ─────────────────────────────────────────────── */
async function apiPatch(id: string, payload: Partial<HomeService>) {
  const res = await fetch(`${API_URL}/kiosk/home-services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...auditHeaders() },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`PATCH ${id} → ${res.status}`);
  return res.json();
}

async function apiSeed(locationId: string | null) {
  const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const res = await fetch(`${API_URL}/kiosk/home-services/seed${q}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...auditHeaders() },
  });
  if (!res.ok) throw new Error(`Seed → ${res.status}`);
  return res.json();
}

async function fetchAll(locationId: string | null): Promise<HomeService[]> {
  const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : "";
  const res = await fetch(`${API_URL}/kiosk/home-services/all${q}`);
  if (!res.ok) throw new Error(`GET all → ${res.status}`);
  return res.json();
}

/* ── SCREEN_ID choices ─────────────────────────────────── */
const SCREEN_OPTIONS = [
  { id: "submit",   label: "Nộp hồ sơ" },
  { id: "wallet",   label: "Kho giấy tờ" },
  { id: "queue",    label: "Bốc số" },
  { id: "lookup",   label: "Tra cứu" },
  { id: "ai",       label: "Trợ lý ảo" },
  { id: "feedback", label: "Đánh giá dịch vụ" },
];

/* ═══════════════════════════════════════════════════════ */
export function HomeServicesClient({ initialServices, locationId = null }: { initialServices: HomeService[]; locationId?: string | null }) {
  const [services, setServices] = useState<HomeService[]>(initialServices);
  const [busy,    setBusy]    = useState<string | null>(null);
  const [editing, setEditing] = useState<HomeService | null>(null);
  const [toast,   setToast]   = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  async function refresh() {
    try {
      const data = await fetchAll(locationId);
      setServices(data);
    } catch (err) {
      console.error(err);
    }
  }

  /* Toggle visibility */
  async function toggleVisible(svc: HomeService) {
    setBusy(`vis-${svc.id}`);
    try {
      await apiPatch(svc.id, { isVisible: !svc.isVisible });
      showToast(svc.isVisible ? `Đã ẩn "${svc.name}"` : `Đã hiện "${svc.name}"`);
      await refresh();
    } catch {
      showToast("Lỗi cập nhật");
    } finally {
      setBusy(null);
    }
  }

  /* Move up / down (sortOrder) */
  async function move(svc: HomeService, dir: "up" | "down") {
    const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(s => s.id === svc.id);
    if (dir === "up"   && idx === 0)                  return;
    if (dir === "down" && idx === sorted.length - 1)  return;

    const swapIdx = dir === "up" ? idx - 1 : idx + 1;
    const target  = sorted[swapIdx];
    setBusy(`move-${svc.id}`);
    try {
      await Promise.all([
        apiPatch(svc.id,    { sortOrder: target.sortOrder }),
        apiPatch(target.id, { sortOrder: svc.sortOrder }),
      ]);
      await refresh();
    } catch {
      showToast("Lỗi sắp xếp");
    } finally {
      setBusy(null);
    }
  }

  /* Seed */
  async function handleSeed() {
    setBusy("seed");
    try {
      const res = await apiSeed(locationId);
      showToast(res.seeded ? `Đã tạo ${res.count} dịch vụ mặc định` : "Dịch vụ đã tồn tại");
      await refresh();
    } catch {
      showToast("Lỗi seed");
    } finally {
      setBusy(null);
    }
  }

  /* Save edit */
  async function handleSave() {
    if (!editing) return;
    setBusy("save");
    try {
      await apiPatch(editing.id, {
        name:        editing.name,
        nameEn:      editing.nameEn,
        description: editing.description,
        colorHex:    editing.colorHex,
        bgColorHex:  editing.bgColorHex,
        icon:        editing.icon,
        badge:       editing.badge,
        screenId:    editing.screenId,
      });
      showToast("Đã lưu thay đổi");
      setEditing(null);
      await refresh();
    } catch {
      showToast("Lỗi lưu");
    } finally {
      setBusy(null);
    }
  }

  const sorted = [...services].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Header actions */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          {services.filter(s => s.isVisible).length} / {services.length} dịch vụ đang hiển thị
        </p>
        {services.length === 0 && (
          <button
            onClick={handleSeed}
            disabled={busy === "seed"}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === "seed" ? "Đang tạo…" : "Khởi tạo dịch vụ mặc định"}
          </button>
        )}
      </div>

      {/* Service list */}
      {sorted.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16 text-center text-slate-400">
          Chưa có dịch vụ nào. Nhấn &ldquo;Khởi tạo dịch vụ mặc định&rdquo; để bắt đầu.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((svc, idx) => (
            <div
              key={svc.id}
              className={`rounded-2xl border bg-white p-5 shadow-sm transition-opacity ${
                svc.isVisible ? "border-slate-200" : "border-dashed border-slate-200 opacity-60"
              }`}
            >
              <div className="flex items-center gap-4">
                {/* Sort order badge */}
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {idx + 1}
                </div>

                {/* Color dot */}
                <div
                  className="h-10 w-10 shrink-0 rounded-xl"
                  style={{ background: svc.colorHex ?? "#0068B7" }}
                />

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-900">{svc.name}</span>
                    {svc.nameEn && (
                      <span className="text-xs text-slate-400">({svc.nameEn})</span>
                    )}
                    {svc.badge && (
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">
                        {svc.badge}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-sm text-slate-500 truncate">
                    {svc.description ?? "—"}
                    <span className="ml-2 text-xs text-slate-400">→ screen: {svc.screenId}</span>
                  </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  {/* Move up/down */}
                  <button
                    onClick={() => move(svc, "up")}
                    disabled={idx === 0 || !!busy}
                    title="Lên"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    onClick={() => move(svc, "down")}
                    disabled={idx === sorted.length - 1 || !!busy}
                    title="Xuống"
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30"
                  >
                    ↓
                  </button>

                  {/* Edit */}
                  <button
                    onClick={() => setEditing({ ...svc })}
                    className="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    Sửa
                  </button>

                  {/* Toggle visibility */}
                  <button
                    onClick={() => toggleVisible(svc)}
                    disabled={busy === `vis-${svc.id}`}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold transition-colors disabled:opacity-50 ${
                      svc.isVisible
                        ? "bg-green-100 text-green-700 hover:bg-green-200"
                        : "bg-slate-200 text-slate-500 hover:bg-slate-300"
                    }`}
                  >
                    {svc.isVisible ? "Hiển thị" : "Đã ẩn"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit modal */}
      {editing && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="mb-6 text-lg font-bold text-slate-900">Chỉnh sửa dịch vụ</h2>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tên dịch vụ (VI)</label>
                <input
                  value={editing.name}
                  onChange={e => setEditing({ ...editing, name: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Tên dịch vụ (EN)</label>
                <input
                  value={editing.nameEn ?? ""}
                  onChange={e => setEditing({ ...editing, nameEn: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Mô tả</label>
                <input
                  value={editing.description ?? ""}
                  onChange={e => setEditing({ ...editing, description: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Badge (tùy chọn)</label>
                <input
                  value={editing.badge ?? ""}
                  onChange={e => setEditing({ ...editing, badge: e.target.value || null })}
                  placeholder="Ví dụ: 6 giấy tờ"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Màu chữ / icon</label>
                  <input
                    value={editing.colorHex ?? ""}
                    onChange={e => setEditing({ ...editing, colorHex: e.target.value || null })}
                    placeholder="var(--blue) hoặc #0068B7"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Màu nền icon</label>
                  <input
                    value={editing.bgColorHex ?? ""}
                    onChange={e => setEditing({ ...editing, bgColorHex: e.target.value || null })}
                    placeholder="var(--blue-lt) hoặc #EBF4FF"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Icon name</label>
                  <input
                    value={editing.icon ?? ""}
                    onChange={e => setEditing({ ...editing, icon: e.target.value || null })}
                    placeholder="submit, queue, ai…"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">Màn hình kiosk</label>
                  <select
                    value={editing.screenId}
                    onChange={e => setEditing({ ...editing, screenId: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {SCREEN_OPTIONS.map(o => (
                      <option key={o.id} value={o.id}>{o.label} ({o.id})</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                Huỷ
              </button>
              <button
                onClick={handleSave}
                disabled={busy === "save"}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {busy === "save" ? "Đang lưu…" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
