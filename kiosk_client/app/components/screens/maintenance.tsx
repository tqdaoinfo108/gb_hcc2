"use client";
import { Emblem } from "../illustrations";
import { Icon } from "../icons";
import type { KioskRuntimeConfig } from "../../lib/api";

export function MaintenanceScreen({
  config,
  connecting = false,
  error = false,
  onRetry,
}: {
  config?: KioskRuntimeConfig | null;
  connecting?: boolean;
  error?: boolean;
  onRetry?: () => void;
}) {
  const location = config?.location;
  const locationLabel = [location?.name, location?.district, location?.province].filter(Boolean).join(" · ");

  return (
    <div style={{ width: 1920, height: 1080, display: "flex", flexDirection: "column", background: "#EFF6FF" }}>
      <div style={{ height: 6, background: "#C8102E" }} />
      <header style={{
        height: 96, padding: "0 48px", display: "flex", alignItems: "center", gap: 18,
        background: "#fff", borderBottom: "1.5px solid var(--ink-7)",
      }}>
        <Emblem size={60} />
        <div>
          <div style={{ fontSize: 21, fontWeight: 800 }}>Trung tâm Phục vụ Hành chính Công</div>
          <div style={{ marginTop: 3, fontSize: 13, color: "var(--ink-4)" }}>
            {locationLabel || "UBND Phường Cửa Nam · Quận Hoàn Kiếm · Hà Nội"}
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ borderRadius: 12, background: "#F8FAFC", border: "1px solid var(--ink-7)", padding: "10px 14px", fontSize: 13, color: "var(--ink-4)" }}>
          Device ID: <strong style={{ color: "var(--ink-2)", fontFamily: "monospace" }}>
            {config?.deviceId ?? "Chưa cấu hình"}
          </strong>
        </div>
      </header>

      <main style={{ flex: 1, display: "grid", placeItems: "center", padding: 64 }}>
        <section style={{
          width: 920, minHeight: 520, borderRadius: 32, background: "#fff",
          border: "1.5px solid var(--ink-7)", boxShadow: "0 24px 70px rgba(0,82,145,.12)",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "64px 90px", textAlign: "center",
        }}>
          <div style={{
            width: 112, height: 112, borderRadius: 28, display: "grid", placeItems: "center",
            background: connecting ? "var(--blue-lt)" : error ? "#FEE2E2" : "var(--orange-lt)",
            color: connecting ? "var(--blue)" : error ? "#DC2626" : "var(--orange-dk)",
          }}>
            <Icon name={connecting ? "loader" : error ? "x" : "shield"} size={54} className={connecting ? "spin" : undefined} />
          </div>
          <h1 style={{ margin: "32px 0 14px", fontSize: 44, lineHeight: 1.15, letterSpacing: "-.02em" }}>
            {connecting ? "Đang kết nối hệ thống" : error ? "Không thể kết nối máy chủ" : "Thiết bị đang bảo trì"}
          </h1>
          <p style={{ margin: 0, maxWidth: 680, fontSize: 21, lineHeight: 1.6, color: "var(--ink-3)" }}>
            {connecting
              ? "Vui lòng chờ trong giây lát để kiosk tải cấu hình vận hành."
              : error
                ? "Kiosk chưa nhận được cấu hình từ hệ thống quản trị. Vui lòng liên hệ cán bộ kỹ thuật."
                : config?.maintenanceMessage || "Thiết bị đang tạm ngưng để kiểm tra kỹ thuật. Vui lòng sử dụng kiosk khác hoặc liên hệ quầy hướng dẫn."}
          </p>

          {!connecting && (
            <div style={{
              marginTop: 32, width: "100%", borderRadius: 18, background: "#F8FAFC",
              border: "1px solid var(--ink-7)", padding: "18px 24px",
              display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, textAlign: "left",
            }}>
              <Info label="Thiết bị" value={config?.name || config?.deviceId || "Kiosk"} />
              <Info label="Khu vực đặt máy" value={config?.placement || "Chưa cấu hình"} />
            </div>
          )}

          {error && onRetry && (
            <button type="button" onClick={onRetry} style={{
              marginTop: 28, minWidth: 220, height: 56, borderRadius: 14, border: 0,
              background: "var(--blue)", color: "#fff", fontSize: 18, fontWeight: 800, cursor: "pointer",
            }}>
              Thử kết nối lại
            </button>
          )}
        </section>
      </main>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontSize: 13, color: "var(--ink-4)", marginBottom: 5 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink-2)" }}>{value}</div>
    </div>
  );
}
