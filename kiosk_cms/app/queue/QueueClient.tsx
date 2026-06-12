"use client";
import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { StatusBadge, Metric } from "../components";
import { auditHeaders } from "../lib/audit-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL  ?? "http://localhost:3001";

/* ── Types ─────────────────────────────────────────────── */
interface TicketRow {
  id: string;
  displayNumber: string;
  status: string;
  calledAt: string | null;
}
interface CounterRow {
  id: string;
  number: string;
  name: string | null;
  status: string;
  tickets: TicketRow[];
}
interface ServiceRow {
  id: string;
  code: string;
  name: string;
  prefix: string;
  colorHex: string | null;
  currentNumber: number;
  counters: CounterRow[];
  _count: { tickets: number };
}
interface Stats { waiting: number; serving: number; completed: number }
interface Props { initialServices: ServiceRow[]; initialStats: Stats; locationId?: string | null }

/* ── CRUD form states ──────────────────────────────────── */
interface ServiceFormState {
  mode: "create" | "edit";
  id?: string;
  code: string; name: string; nameEn: string;
  description: string; colorHex: string; prefix: string;
}
interface AddCounterState {
  serviceId: string; serviceName: string; number: string; name: string;
}

/* ── Helpers ───────────────────────────────────────────── */
async function apiCall(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...auditHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const msg = payload?.message ?? `${method} ${path} → ${res.status}`;
    throw new Error(Array.isArray(msg) ? msg.join(", ") : msg);
  }
  return res.json();
}

/* ═══════════════════════════════════════════════════════ */
export function QueueClient({ initialServices, initialStats, locationId = null }: Props) {
  const [services,   setServices]   = useState<ServiceRow[]>(initialServices);
  const [stats,      setStats]      = useState<Stats>(initialStats);
  const [busy,       setBusy]       = useState<string | null>(null);
  const [toast,      setToast]      = useState<string | null>(null);
  const [svcForm,    setSvcForm]    = useState<ServiceFormState | null>(null);
  const [addCounter, setAddCounter] = useState<AddCounterState | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);

  /* ── Refresh ─────────────────────────────────────────── */
  const refresh = useCallback(async () => {
    try {
      const data = await fetch("/api/queue/overview").then(r => r.json());
      setServices(data.services);
      setStats(data.stats);
    } catch (err) { console.error("Queue refresh failed:", err); }
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }

  /* ── Socket ──────────────────────────────────────────── */
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;
    import("socket.io-client").then(({ io }) => {
      socket = io(`${WS_URL}/queue`, { transports: ["websocket", "polling"] });
      ["queue:ticket_issued","queue:ticket_called","queue:ticket_completed",
       "queue:ticket_cancelled","queue:seeded"].forEach(e => socket.on(e, refresh));
    });
    return () => socket?.disconnect();
  }, [refresh]);

  /* ── Ticket mutations ────────────────────────────────── */
  async function handleSeed() {
    setBusy("seed");
    try {
      const r = await apiCall(`/queue/seed${locationId ? `?locationId=${encodeURIComponent(locationId)}` : ""}`, "POST");
      showToast(r.message);
      await refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi khởi tạo");
    } finally { setBusy(null); }
  }

  async function handleCallNext(serviceId: string, counterId: string, label: string) {
    setBusy(`call-${serviceId}`);
    try {
      const t = await apiCall(`/queue/${serviceId}/call-next`, "POST", { counterId });
      t ? showToast(`🔔 Gọi số ${t.displayNumber} — ${label}`) : showToast("Hàng đợi đã trống");
      await refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi gọi số");
    } finally { setBusy(null); }
  }

  async function handleComplete(ticketId: string, dn: string) {
    setBusy(`done-${ticketId}`);
    try {
      await apiCall(`/queue/tickets/${ticketId}/complete`, "PATCH");
      showToast(`✅ Hoàn thành ${dn}`);
      await refresh();
    } catch { showToast("Lỗi cập nhật"); } finally { setBusy(null); }
  }

  /* ── Service CRUD ────────────────────────────────────── */
  async function handleSaveService() {
    if (!svcForm) return;
    setBusy("svc-save");
    try {
      if (svcForm.mode === "create") {
        await apiCall("/queue/services", "POST", {
          code: svcForm.code, name: svcForm.name,
          nameEn: svcForm.nameEn || undefined,
          description: svcForm.description || undefined,
          colorHex: svcForm.colorHex || undefined,
          prefix: svcForm.prefix || "A",
          locationId: locationId ?? undefined,
        });
        showToast(`Đã tạo "${svcForm.name}"`);
      } else {
        await apiCall(`/queue/services/${svcForm.id}`, "PATCH", {
          name: svcForm.name, nameEn: svcForm.nameEn || undefined,
          description: svcForm.description || undefined,
          colorHex: svcForm.colorHex || undefined,
          prefix: svcForm.prefix || undefined,
        });
        showToast(`Đã cập nhật "${svcForm.name}"`);
      }
      setSvcForm(null);
      await refresh();
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Lỗi lưu dịch vụ");
    } finally { setBusy(null); }
  }

  async function handleDeleteService() {
    if (!confirmDel) return;
    setBusy("svc-del");
    try {
      await apiCall(`/queue/services/${confirmDel.id}`, "DELETE");
      showToast(`Đã xoá "${confirmDel.name}"`);
      setConfirmDel(null);
      await refresh();
    } catch { showToast("Lỗi xoá"); } finally { setBusy(null); }
  }

  /* ── Counter CRUD ────────────────────────────────────── */
  async function handleAddCounter() {
    if (!addCounter) return;
    setBusy("ctr-add");
    try {
      await apiCall(`/queue/services/${addCounter.serviceId}/counters`, "POST", {
        number: addCounter.number, name: addCounter.name || undefined,
      });
      showToast(`Đã thêm Quầy ${addCounter.number}`);
      setAddCounter(null);
      await refresh();
    } catch { showToast("Lỗi thêm quầy"); } finally { setBusy(null); }
  }

  async function handleDeleteCounter(counterId: string, label: string) {
    if (!confirm(`Xoá ${label}?`)) return;
    setBusy(`ctr-del-${counterId}`);
    try {
      await apiCall(`/queue/counters/${counterId}`, "DELETE");
      showToast(`Đã xoá ${label}`);
      await refresh();
    } catch { showToast("Lỗi xoá quầy"); } finally { setBusy(null); }
  }

  /* ── RENDER ─────────────────────────────────────────── */
  return (
    <div>
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-2xl bg-slate-900 px-5 py-3 text-sm
                        font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* KPIs */}
      <section className="mb-6 grid gap-4 md:grid-cols-4">
        <Metric label="Đang chờ"     value={stats.waiting}   color="#D97706" />
        <Metric label="Đang phục vụ" value={stats.serving}   color="#1D4ED8" />
        <Metric label="Hoàn thành"   value={stats.completed} color="#16A34A" />
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm
                        flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-500">Dịch vụ</span>
          <span className="text-3xl font-black text-slate-800">{services.length}</span>
        </div>
      </section>

      {/* Action bar */}
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-base font-bold text-slate-700">Danh sách dịch vụ</h2>
        <div className="flex gap-2">
          {services.length === 0 && (
            <button onClick={handleSeed} disabled={busy === "seed"}
              className="rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white
                         hover:bg-amber-600 disabled:opacity-60">
              {busy === "seed" ? "Đang khởi tạo…" : "Khởi tạo mặc định"}
            </button>
          )}
          <button
            onClick={() => setSvcForm({ mode:"create", code:"", name:"", nameEn:"",
                                        description:"", colorHex:"", prefix:"A" })}
            className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white
                       hover:bg-blue-700">
            + Thêm dịch vụ
          </button>
        </div>
      </div>

      {/* Empty */}
      {services.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-200 py-16
                        text-center text-slate-400">
          Chưa có dịch vụ hàng đợi. Nhấn &ldquo;Khởi tạo mặc định&rdquo; hoặc
          &ldquo;Thêm dịch vụ&rdquo;.
        </div>
      )}

      {/* Service card grid */}
      <div className="grid gap-5 md:grid-cols-2">
        {services.map(svc => {
          const openCtr      = svc.counters.find(c => c.status === "OPEN");
          const callingBusy  = busy === `call-${svc.id}`;
          const servingTicket = svc.counters.flatMap(c => c.tickets)[0] ?? null;

          return (
            <div key={svc.id}
              className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">

              {/* ── Card header ──────────────────────────── */}
              <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100">
                <div className="h-5 w-5 rounded-full shrink-0"
                  style={{ background: svc.colorHex ?? "#CBD5E1" }} />
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold truncate">{svc.name}</h2>
                  <p className="text-xs text-slate-400">
                    Tiền tố: <strong className="text-slate-600">{svc.prefix}</strong>
                    {" · "}Số hiện tại: <strong className="text-slate-600">{svc.currentNumber}</strong>
                    {" · "}<span className="font-mono">{svc.code}</span>
                  </p>
                </div>
                {/* Actions */}
                <div className="flex gap-1 shrink-0">
                  <button
                    onClick={() => setSvcForm({
                      mode:"edit", id: svc.id, code: svc.code, name: svc.name,
                      nameEn:"", description:"", colorHex: svc.colorHex ?? "", prefix: svc.prefix,
                    })}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold
                               text-slate-500 hover:bg-slate-100">
                    Sửa
                  </button>
                  <button
                    onClick={() => setConfirmDel({ id: svc.id, name: svc.name })}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold
                               text-red-500 hover:bg-red-50">
                    Xoá
                  </button>
                  <Link href={`/queue/${svc.id}`}
                    className="rounded-lg px-2.5 py-1 text-xs font-semibold
                               text-blue-600 hover:bg-blue-50">
                    Chi tiết →
                  </Link>
                </div>
              </div>

              {/* ── Stats row ────────────────────────────── */}
              <div className="grid grid-cols-2 divide-x divide-slate-100 border-b border-slate-100">
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-400">Đang chờ</p>
                  <p className="text-2xl font-black text-amber-600">{svc._count.tickets}</p>
                </div>
                <div className="p-4 text-center">
                  <p className="text-xs text-slate-400">Đang phục vụ</p>
                  <p className="text-2xl font-black text-blue-700">
                    {servingTicket?.displayNumber ?? "—"}
                  </p>
                </div>
              </div>

              {/* ── Counter list ─────────────────────────── */}
              <div className="divide-y divide-slate-50">
                {svc.counters.map(ctr => {
                  const serving = ctr.tickets[0] ?? null;
                  return (
                    <div key={ctr.id}
                      className="flex items-center gap-3 px-5 py-3">
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-slate-700">
                          Quầy {ctr.number}
                          {ctr.name && ctr.name !== `Quầy ${ctr.number}` ? ` — ${ctr.name}` : ""}
                        </span>
                        {serving && (
                          <span className="ml-2 rounded-full bg-blue-50 px-2 py-0.5
                                           text-xs font-bold text-blue-600">
                            Đang: {serving.displayNumber}
                          </span>
                        )}
                      </div>
                      <StatusBadge status={ctr.status.toLowerCase()} />
                      {serving && (
                        <button
                          onClick={() => handleComplete(serving.id, serving.displayNumber)}
                          disabled={!!busy}
                          className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-bold
                                     text-green-700 hover:bg-green-100 disabled:opacity-50">
                          {busy === `done-${serving.id}` ? "…" : "✓ Xong"}
                        </button>
                      )}
                      <button
                        onClick={() => handleDeleteCounter(ctr.id, `Quầy ${ctr.number}`)}
                        disabled={!!busy}
                        className="rounded-lg px-2 py-1 text-xs font-semibold text-red-400
                                   hover:bg-red-50 disabled:opacity-40"
                        title="Xoá quầy">
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* ── Bottom bar ───────────────────────────── */}
              <div className="flex gap-2 px-5 pb-4 pt-3">
                <button
                  onClick={() => setAddCounter({
                    serviceId: svc.id, serviceName: svc.name,
                    number: String(svc.counters.length + 1).padStart(2, "0"), name: "",
                  })}
                  className="shrink-0 rounded-xl border border-slate-200 px-3 py-2.5
                             text-xs font-bold text-slate-600 hover:bg-slate-50">
                  + Thêm quầy
                </button>
                <button
                  onClick={() => openCtr && handleCallNext(
                    svc.id, openCtr.id, `Quầy ${openCtr.number}`)}
                  disabled={!openCtr || callingBusy || !!busy || svc._count.tickets === 0}
                  className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white
                             hover:bg-blue-700 disabled:cursor-not-allowed
                             disabled:bg-slate-200 disabled:text-slate-400 transition-colors">
                  {callingBusy         ? "Đang gọi…"
                    : !openCtr         ? "Không có quầy mở"
                    : svc._count.tickets === 0 ? "Hàng đợi trống"
                    : `🔔 Gọi số tiếp theo — Quầy ${openCtr.number}`}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Modal: Create / Edit Service ─────────────────── */}
      {svcForm && (
        <div className="fixed inset-0 z-40 flex items-center justify-center
                        bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="mb-6 text-lg font-bold text-slate-900">
              {svcForm.mode === "create" ? "Thêm dịch vụ mới" : `Sửa: ${svcForm.name}`}
            </h2>
            <div className="space-y-4">
              {svcForm.mode === "create" && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Mã dịch vụ (CODE) *
                  </label>
                  <input value={svcForm.code}
                    onChange={e => setSvcForm({ ...svcForm, code: e.target.value.toUpperCase() })}
                    placeholder="HOT, DAT, CCC…"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tên dịch vụ *
                </label>
                <input value={svcForm.name}
                  onChange={e => setSvcForm({ ...svcForm, name: e.target.value })}
                  placeholder="Hộ tịch"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">Mô tả</label>
                <input value={svcForm.description}
                  onChange={e => setSvcForm({ ...svcForm, description: e.target.value })}
                  placeholder="Đăng ký khai sinh, kết hôn…"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Tiền tố số
                  </label>
                  <input value={svcForm.prefix}
                    onChange={e => setSvcForm({ ...svcForm, prefix: e.target.value })}
                    placeholder="A" maxLength={2}
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-600">
                    Màu (#hex)
                  </label>
                  <input value={svcForm.colorHex}
                    onChange={e => setSvcForm({ ...svcForm, colorHex: e.target.value })}
                    placeholder="#0068B7"
                    className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                               focus:outline-none focus:ring-2 focus:ring-blue-500" />
                </div>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setSvcForm(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm
                           font-semibold text-slate-600 hover:bg-slate-50">
                Huỷ
              </button>
              <button onClick={handleSaveService}
                disabled={busy === "svc-save" || !svcForm.name.trim()
                           || (svcForm.mode === "create" && !svcForm.code.trim())}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white
                           hover:bg-blue-700 disabled:opacity-50">
                {busy === "svc-save" ? "Đang lưu…"
                  : svcForm.mode === "create" ? "Tạo dịch vụ" : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Add Counter ─────────────────────────────── */}
      {addCounter && (
        <div className="fixed inset-0 z-40 flex items-center justify-center
                        bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl">
            <h2 className="mb-5 text-lg font-bold text-slate-900">
              Thêm quầy —{" "}
              <span className="text-blue-600">{addCounter.serviceName}</span>
            </h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Số quầy *
                </label>
                <input value={addCounter.number}
                  onChange={e => setAddCounter({ ...addCounter, number: e.target.value })}
                  placeholder="03"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-600">
                  Tên quầy (tuỳ chọn)
                </label>
                <input value={addCounter.name}
                  onChange={e => setAddCounter({ ...addCounter, name: e.target.value })}
                  placeholder="Quầy 3"
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm
                             focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setAddCounter(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm
                           font-semibold text-slate-600 hover:bg-slate-50">
                Huỷ
              </button>
              <button onClick={handleAddCounter}
                disabled={busy === "ctr-add" || !addCounter.number.trim()}
                className="rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white
                           hover:bg-blue-700 disabled:opacity-50">
                {busy === "ctr-add" ? "Đang thêm…" : "Thêm quầy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirm Delete ─────────────────────────── */}
      {confirmDel && (
        <div className="fixed inset-0 z-40 flex items-center justify-center
                        bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-8 shadow-2xl text-center">
            <div className="mb-4 text-4xl">⚠️</div>
            <h2 className="mb-2 text-lg font-bold text-slate-900">Xoá dịch vụ?</h2>
            <p className="mb-6 text-sm text-slate-500">
              Dịch vụ <strong className="text-slate-700">{confirmDel.name}</strong> và tất cả
              quầy của nó sẽ bị xoá. Các vé đã phát không bị ảnh hưởng.
            </p>
            <div className="flex justify-center gap-3">
              <button onClick={() => setConfirmDel(null)}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm
                           font-semibold text-slate-600 hover:bg-slate-50">
                Huỷ
              </button>
              <button onClick={handleDeleteService} disabled={busy === "svc-del"}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white
                           hover:bg-red-700 disabled:opacity-50">
                {busy === "svc-del" ? "Đang xoá…" : "Xác nhận xoá"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
