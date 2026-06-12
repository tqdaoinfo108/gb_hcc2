"use client";
import React, { useState, useEffect, useRef } from "react";
import { TopBar, PageHeader } from "../ui";
import { Icon } from "../icons";
import { queueApi, QueueServiceData, QueueTicketData, ServiceStats } from "../../lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "http://localhost:3001";

/* Map backend service codes → visual style */
const SERVICE_STYLES: Record<string, { icon: string; color: string; bg: string }> = {
  HOT: { icon: "hotich",    color: "var(--blue)",   bg: "var(--blue-lt)"   },
  DAT: { icon: "datdai",    color: "var(--teal)",   bg: "var(--teal-lt)"   },
  CCC: { icon: "cccd",      color: "var(--orange)", bg: "var(--orange-lt)" },
  CTH: { icon: "chungthuc", color: "var(--green)",  bg: "var(--green-lt)"  },
};
const DEFAULT_STYLE = { icon: "ticket", color: "var(--blue)", bg: "var(--blue-lt)" };

/* ───────────────────────────── Props ────────────────────────────── */
interface Props {
  lang: "vi" | "en";
  onLangChange: (l: "vi" | "en") => void;
  onBack:  () => void;
  onHome:  () => void;
  onHelp:  () => void;
  sessionId?: string;
  kioskId?: string;
  locationId?: string;
}

/* ═══════════════════════════════════════════════════════════════════ */
export function QueueScreen({ lang, onLangChange, onBack, onHome, onHelp, sessionId, kioskId, locationId }: Props) {
  const [services,  setServices]  = useState<QueueServiceData[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [issuing,   setIssuing]   = useState(false);
  const [ticket,    setTicket]    = useState<QueueTicketData | null>(null);
  const [liveStats, setLiveStats] = useState<Record<string, ServiceStats>>({});
  const [hov,       setHov]       = useState<string | null>(null);
  const [printed,   setPrinted]   = useState(false);

  /* ── Load services on mount ─────────────────────────────── */
  useEffect(() => {
    queueApi.getServices(locationId)
      .then(setServices)
      .catch(err => console.error("Failed to load queue services:", err))
      .finally(() => setLoading(false));
  }, [locationId]);

  /* ── Socket.io for real-time queue updates ──────────────── */
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let socket: any = null;

    import("socket.io-client").then(({ io }) => {
      socket = io(`${WS_URL}/queue`, {
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionDelay: 2000,
      });

      const handleStats = (data: ServiceStats) => {
        setLiveStats(prev => ({ ...prev, [data.serviceId]: data }));
      };

      socket.on("queue:service_stats",    handleStats);
      socket.on("queue:ticket_issued",    ({ stats }: { stats: ServiceStats }) => handleStats(stats));
      socket.on("queue:ticket_called",    ({ stats }: { stats: ServiceStats }) => handleStats(stats));
      socket.on("queue:ticket_completed", ({ stats }: { stats: ServiceStats }) => handleStats(stats));
    });

    return () => { socket?.disconnect(); };
  }, []);

  /* ── Issue ticket ───────────────────────────────────────── */
  async function pickService(serviceId: string) {
    setIssuing(true);
    try {
      const t = await queueApi.issueTicket(serviceId, { kioskId, sessionId });
      setTicket(t);
      setPrinted(false);
      // Also fetch stats so we have current serving immediately
      const s = await queueApi.getStats(serviceId);
      setLiveStats(prev => ({ ...prev, [serviceId]: s }));
    } catch (err) {
      console.error("Failed to issue ticket:", err);
    } finally {
      setIssuing(false);
    }
  }

  /* ── TICKET VIEW ─────────────────────────────────────────── */
  if (ticket) {
    const svc    = services.find(s => s.id === ticket.serviceId);
    const style  = svc ? (SERVICE_STYLES[svc.code] ?? DEFAULT_STYLE) : DEFAULT_STYLE;
    const name   = svc?.name ?? ticket.service?.name ?? "";
    const stats  = liveStats[ticket.serviceId];

    return (
      <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
        <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
          title="Phiếu số thứ tự" />
        <PageHeader title="" onBack={() => { setTicket(null); }} />

        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 80 }}>

          {/* ── Ticket card ── */}
          <div style={{
            width: 480, background: "#fff", borderRadius: 28,
            border: "1.5px solid var(--ink-7)", boxShadow: "var(--shadow-xl)",
            padding: "48px 40px", display: "flex", flexDirection: "column", alignItems: "center", gap: 16,
            animation: "pop .4s cubic-bezier(0.34,1.56,0.64,1) both",
          }}>
            <div style={{
              fontSize: 13, fontWeight: 700, letterSpacing: ".1em",
              textTransform: "uppercase", color: style.color,
            }}>
              Số thứ tự — {name}
            </div>

            <div style={{
              fontSize: 200, fontWeight: 900, color: style.color,
              lineHeight: 1, fontVariantNumeric: "tabular-nums", letterSpacing: "-.04em",
            }}>
              {ticket.displayNumber}
            </div>

            <div style={{ width: "100%", height: 1, background: "var(--ink-7)" }} />

            {/* Stats row */}
            <div style={{ width: "100%", display: "flex", justifyContent: "space-around" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 4 }}>Đang phục vụ</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink-1)" }}>
                  {stats?.currentServing ?? "—"}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 4 }}>Chờ phía trước</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--orange)" }}>
                  {ticket.waitingAhead ?? stats?.waitingCount ?? "—"}
                </div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, color: "var(--ink-4)", marginBottom: 4 }}>Thời gian chờ</div>
                <div style={{ fontSize: 28, fontWeight: 800, color: "var(--teal)" }}>
                  ~{ticket.estimatedWaitMin ?? stats?.estimatedWaitMin ?? 0} phút
                </div>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg"
              onClick={() => setPrinted(true)}
              style={{ width: "100%", gap: 12, marginTop: 8, opacity: printed ? 0.7 : 1 }}
            >
              <Icon name="print" size={20} />
              {printed ? "Đã in phiếu!" : "In phiếu số"}
            </button>
          </div>

          {/* ── Info panel ── */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 420 }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "var(--ink-0)" }}>Hướng dẫn chờ</div>
            {[
              { icon: "ticket",   text: "Giữ phiếu số và đợi màn hình gọi số của bạn" },
              { icon: "calendar", text: "Vui lòng có mặt trước 5 phút khi gần đến lượt" },
              { icon: "help",     text: "Liên hệ nhân viên nếu cần hỗ trợ khẩn cấp" },
            ].map(item => (
              <div key={item.icon} style={{ display: "flex", gap: 16, alignItems: "flex-start" }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12, background: style.bg,
                  display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                }}>
                  <Icon name={item.icon} size={22} style={{ color: style.color }} />
                </div>
                <div style={{ fontSize: 17, color: "var(--ink-2)", lineHeight: 1.6, paddingTop: 6 }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ── CATEGORY PICKER ─────────────────────────────────────── */
  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "var(--ink-8)" }}>
      <TopBar lang={lang} onLangChange={onLangChange} onHome={onHome} onHelp={onHelp}
        title="Bốc số thứ tự" subtitle="Chọn lĩnh vực bạn cần giải quyết" />
      <PageHeader title="" onBack={onBack} />

      {/* Loading state */}
      {(loading || issuing) && (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center", gap: 20,
            color: "var(--ink-3)",
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%",
              border: "4px solid var(--ink-6)",
              borderTopColor: "var(--blue)",
              animation: "spin 1s linear infinite",
            }} />
            <div style={{ fontSize: 22, fontWeight: 600 }}>
              {issuing ? "Đang phát số..." : "Đang tải dịch vụ..."}
            </div>
          </div>
        </div>
      )}

      {/* Empty state */}
      {!loading && !issuing && services.length === 0 && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <Icon name="ticket" size={64} style={{ color: "var(--ink-5)" }} />
          <div style={{ fontSize: 24, fontWeight: 700, color: "var(--ink-2)" }}>
            Hệ thống hàng đợi chưa được khởi tạo
          </div>
          <div style={{ fontSize: 16, color: "var(--ink-4)" }}>
            Vui lòng liên hệ nhân viên để được hỗ trợ
          </div>
        </div>
      )}

      {/* Service grid */}
      {!loading && !issuing && services.length > 0 && (
        <div style={{
          flex: 1,
          display: "grid",
          gridTemplateColumns: `repeat(${Math.min(services.length, 2)}, 1fr)`,
          gridTemplateRows: `repeat(${Math.ceil(services.length / 2)}, 1fr)`,
          gap: 28,
          padding: "0 80px 60px",
        }}>
          {services.map(svc => {
            const style = SERVICE_STYLES[svc.code] ?? DEFAULT_STYLE;
            const isHov = hov === svc.id;
            const waiting = liveStats[svc.id]?.waitingCount ?? svc._count.tickets;
            return (
              <button
                key={svc.id}
                onClick={() => pickService(svc.id)}
                onPointerEnter={() => setHov(svc.id)}
                onPointerLeave={() => setHov(null)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 20, borderRadius: 28, cursor: "pointer",
                  background: isHov ? style.color : "#fff",
                  border: `2px solid ${isHov ? style.color : "var(--ink-7)"}`,
                  boxShadow: isHov ? "0 12px 40px rgba(0,0,0,.15)" : "var(--shadow-md)",
                  transform: isHov ? "scale(1.02)" : "none",
                  transition: "all .25s cubic-bezier(0.34,1.56,0.64,1)",
                  position: "relative",
                }}
              >
                {/* Waiting badge */}
                {waiting > 0 && (
                  <div style={{
                    position: "absolute", top: 16, right: 20,
                    background: isHov ? "rgba(255,255,255,.25)" : style.color,
                    color: "#fff", borderRadius: 999,
                    padding: "3px 12px", fontSize: 13, fontWeight: 700,
                  }}>
                    {waiting} đang chờ
                  </div>
                )}

                <div style={{
                  width: 96, height: 96, borderRadius: 24,
                  background: isHov ? "rgba(255,255,255,.2)" : style.bg,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}>
                  <Icon name={style.icon} size={48} style={{ color: isHov ? "#fff" : style.color }} />
                </div>

                <div style={{ fontSize: 32, fontWeight: 800, color: isHov ? "#fff" : "var(--ink-0)" }}>
                  {svc.name}
                </div>

                {svc.description && (
                  <div style={{
                    fontSize: 14, color: isHov ? "rgba(255,255,255,.8)" : "var(--ink-4)",
                    textAlign: "center", maxWidth: 320, lineHeight: 1.5,
                    padding: "0 16px",
                  }}>
                    {svc.description}
                  </div>
                )}

                <div style={{
                  padding: "10px 28px", borderRadius: 999,
                  background: isHov ? "rgba(255,255,255,.2)" : "var(--ink-8)",
                  color: isHov ? "#fff" : "var(--ink-4)", fontSize: 15, fontWeight: 600,
                }}>
                  Bốc số ngay
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
