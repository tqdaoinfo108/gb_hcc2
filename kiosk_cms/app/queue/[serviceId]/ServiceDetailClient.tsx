"use client";
import { useState, useEffect, useCallback } from "react";
import { StatusBadge, fmt } from "../../components";
import { auditHeaders } from "../../lib/audit-headers";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const WS_URL  = process.env.NEXT_PUBLIC_WS_URL  ?? "http://localhost:3001";

/* ── Types ─────────────────────────────────────────────── */
interface TicketRow {
  id: string;
  displayNumber: string;
  status: string;
  issuedAt: string;
  calledAt: string | null;
  priority: number;
}

interface CounterRow {
  id: string;
  number: string;
  name: string | null;
  status: string;
  tickets: TicketRow[];  // currently CALLED/SERVING
}

interface ServiceRow {
  id: string;
  name: string;
  prefix: string;
  colorHex: string | null;
  currentNumber: number;
  counters: CounterRow[];
}

interface Props {
  service:        ServiceRow;
  initialWaiting: TicketRow[];
}

/* ── API helper ─────────────────────────────────────────── */
async function apiCall(path: string, method = "GET", body?: unknown) {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", ...auditHeaders() },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════ */
export function ServiceDetailClient({ service, initialWaiting }: Props) {
  const [waiting,  setWaiting]  = useState<TicketRow[]>(initialWaiting);
  const [counters, setCounters] = useState<CounterRow[]>(service.counters);
  const [busy,     setBusy]     = useState<string | null>(null);
  const [toast,    setToast]    = useState<string | null>(null);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }

  /* ── Refresh per-service data ─────────────────────── */
  const refresh = useCallback(async () => {
    try {
      const [countersData, waitingData] = await Promise.all([
        apiCall(`/queue/services/${service.id}/counters`),
        apiCall(`/queue/${service.id}/waiting`),
      ]);
      setCounters(countersData);
      setWaiting(waitingData);
    } catch (err) {
      console.error("Refresh error:", err);
    }
  }, [service.id]);

  /* ── Socket.io ──────────────────────────────────── */
  useEffect(() => {
    let socket: any = null;
    import("socket.io-client").then(({ io }) => {
      socket = io(`${WS_URL}/queue`, { transports: ["websocket", "polling"] });
      socket.on("queue:service_stats",    (d: any) => { if (d.serviceId === service.id) refresh(); });
      socket.on("queue:ticket_issued",    (d: any) => { if (d.stats?.serviceId === service.id) refresh(); });
      socket.on("queue:ticket_called",    (d: any) => { if (d.stats?.serviceId === service.id) refresh(); });
      socket.on("queue:ticket_completed", (d: any) => { if (d.stats?.serviceId === service.id) refresh(); });
    });
    return () => socket?.disconnect();
  }, [service.id, refresh]);

  /* ── Mutations ──────────────────────────────────── */
  async function handleCallNext(counterId: string, counterLabel: string) {
    setBusy(`call-${counterId}`);
    try {
      const ticket = await apiCall(`/queue/${service.id}/call-next`, "POST", { counterId });
      ticket
        ? showToast(`🔔 Gọi số ${ticket.displayNumber} — ${counterLabel}`)
        : showToast("Hàng đợi đã trống");
      await refresh();
    } catch { showToast("Lỗi gọi số"); }
    finally  { setBusy(null); }
  }

  async function handleComplete(ticketId: string, displayNumber: string) {
    setBusy(`done-${ticketId}`);
    try {
      await apiCall(`/queue/tickets/${ticketId}/complete`, "PATCH");
      showToast(`✅ Hoàn thành số ${displayNumber}`);
      await refresh();
    } catch { showToast("Lỗi cập nhật"); }
    finally  { setBusy(null); }
  }

  async function handleCancel(ticketId: string, displayNumber: string) {
    if (!confirm(`Hủy vé số ${displayNumber}?`)) return;
    setBusy(`cancel-${ticketId}`);
    try {
      await apiCall(`/queue/tickets/${ticketId}/cancel`, "PATCH");
      showToast(`Đã hủy vé ${displayNumber}`);
      await refresh();
    } catch { showToast("Lỗi hủy vé"); }
    finally  { setBusy(null); }
  }

  /* ── RENDER ────────────────────────────────────── */
  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-6 right-6 z-50 rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* ── Counters ── */}
      <section>
        <h2 className="mb-3 text-base font-bold text-slate-700">Quầy phục vụ</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {counters.map(counter => {
            const serving = counter.tickets[0] ?? null;
            const isOpen  = counter.status === "OPEN";
            const callKey = `call-${counter.id}`;

            return (
              <div key={counter.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="font-bold">
                      Quầy {counter.number}
                      {counter.name ? ` — ${counter.name}` : ""}
                    </h3>
                    {serving ? (
                      <p className="mt-0.5 text-sm text-slate-500">
                        Đang phục vụ:{" "}
                        <strong className="text-blue-600">{serving.displayNumber}</strong>
                        {serving.calledAt && (
                          <span className="ml-2 text-xs text-slate-400">({fmt(new Date(serving.calledAt))})</span>
                        )}
                      </p>
                    ) : (
                      <p className="mt-0.5 text-xs text-slate-400">Chưa có số đang phục vụ</p>
                    )}
                  </div>
                  <StatusBadge status={counter.status.toLowerCase()} />
                </div>

                <div className="flex gap-2">
                  {serving && (
                    <button
                      onClick={() => handleComplete(serving.id, serving.displayNumber)}
                      disabled={!!busy}
                      className="flex-1 rounded-xl bg-green-600 py-2.5 text-sm font-bold text-white
                                 hover:bg-green-700 disabled:opacity-50 transition-colors"
                    >
                      {busy === `done-${serving.id}` ? "…" : "✓ Hoàn thành"}
                    </button>
                  )}
                  <button
                    onClick={() => handleCallNext(counter.id, `Quầy ${counter.number}`)}
                    disabled={!isOpen || !!busy || waiting.length === 0}
                    className="flex-1 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white
                               hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-200
                               disabled:text-slate-400 transition-colors"
                  >
                    {busy === callKey
                      ? "Đang gọi…"
                      : !isOpen
                        ? "Quầy đóng"
                        : waiting.length === 0
                          ? "Hết vé"
                          : "🔔 Gọi tiếp"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Waiting Queue ── */}
      <section>
        <div className="mb-3 flex items-center gap-3">
          <h2 className="text-base font-bold text-slate-700">Hàng đợi</h2>
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-700">
            {waiting.length} vé đang chờ
          </span>
        </div>

        {waiting.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-400">
            Không có vé nào đang chờ
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            {waiting.map((t, i) => (
              <div key={t.id}
                className="group relative rounded-2xl border border-slate-200 bg-white px-5 py-3 shadow-sm
                           hover:border-red-200 hover:shadow-md transition-all"
              >
                {/* Position badge */}
                <div className="mb-1 text-xs font-semibold text-slate-400">#{i + 1}</div>
                <div
                  className="text-2xl font-black"
                  style={{ color: service.colorHex ?? "#0068B7" }}
                >
                  {t.displayNumber}
                </div>
                <div className="mt-0.5 text-xs text-slate-400">{fmt(new Date(t.issuedAt))}</div>

                {/* Cancel on hover */}
                <button
                  onClick={() => handleCancel(t.id, t.displayNumber)}
                  disabled={!!busy}
                  className="absolute right-1.5 top-1.5 hidden rounded-lg px-2 py-0.5 text-xs font-semibold
                             text-red-500 hover:bg-red-50 group-hover:flex disabled:opacity-50"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
